package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"regexp"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/cognitoidentityprovider"
	awslambda "github.com/aws/aws-sdk-go/service/lambda"
)

/*****************************************************/
// Define types, variables and constants
/*****************************************************/
type UpdateRoleRequest struct {
	NewRole []string `json:"newRole"`
}

const (
	contentTypeHeader = "Content-Type"
	jsonContentType   = "application/json"
)

type ErrorResponse struct {
	Error string `json:"error"`
}

var cognitoClient *cognitoidentityprovider.CognitoIdentityProvider
var lambdaClient *awslambda.Lambda
var publishRouteRegex *regexp.Regexp

func init() {
	sess := session.Must(session.NewSession())
	cognitoClient = cognitoidentityprovider.New(sess)
	lambdaClient = awslambda.New(sess)

	// Compile regex for publish route: publish/{app-slug}/version/{version-id}
	publishRouteRegex = regexp.MustCompile(`publish/[^/]+/version/[^/]+`)
}

/*****************************************************/
// Helper functions
/*****************************************************/

func addUserToGroup(userPoolId, username, groupName string) error {
	input := &cognitoidentityprovider.AdminAddUserToGroupInput{
		UserPoolId: aws.String(userPoolId),
		Username:   aws.String(username),
		GroupName:  aws.String(groupName),
	}
	_, err := cognitoClient.AdminAddUserToGroup(input)
	if err != nil {
		return err
	}
	return nil
}

func parseCustomRoles(rolesString string) []string {
	if rolesString == "" {
		log.Println("No preferred roles found, defaulting to Subscriber")
		return []string{"Subscriber"}
	}

	roles := strings.Split(rolesString, ",")
	var cleanRoles []string

	for _, role := range roles {
		role = strings.TrimSpace(role)
		if role == "Subscriber" || role == "Publisher" {
			cleanRoles = append(cleanRoles, role)
		}
	}
	if len(cleanRoles) == 0 {
		log.Println("No valid roles found, defaulting to Subscriber")
		return []string{"Subscriber"}
	}
	return cleanRoles
}

func getUserFromJWT(event events.APIGatewayV2HTTPRequest) (string, error) {
	claims := event.RequestContext.Authorizer.JWT.Claims

	// Try username (most reliable for Cognito access tokens)
	if username, ok := claims["username"]; ok && username != "" {
		return username, nil
	}
	// Fallback to sub (unique user ID)
	if sub, ok := claims["sub"]; ok && sub != "" {
		return sub, nil
	}

	return "", fmt.Errorf("no valid username found in JWT claims: %+v", claims)
}

func getCurrentUserGroups(userPoolId, username string) ([]string, error) {
	input := &cognitoidentityprovider.AdminListGroupsForUserInput{
		UserPoolId: aws.String(userPoolId),
		Username:   aws.String(username),
	}

	result, err := cognitoClient.AdminListGroupsForUser(input)
	if err != nil {
		return nil, err
	}

	var groups []string
	for _, group := range result.Groups {
		if group.GroupName != nil {
			groups = append(groups, *group.GroupName)
		}
	}
	return groups, nil
}

func removeUserFromGroups(userPoolId, username string, groups []string) error {
	for _, group := range groups {
		input := &cognitoidentityprovider.AdminRemoveUserFromGroupInput{
			UserPoolId: aws.String(userPoolId),
			Username:   aws.String(username),
			GroupName:  aws.String(group),
		}
		_, err := cognitoClient.AdminRemoveUserFromGroup(input)
		if err != nil {
			log.Printf("Failed to remove user %s from group %s: %v", username, group, err)
			return err
		}
	}
	return nil
}

/*****************************************************/
// Response functions
/*****************************************************/

func createErrorResponse(statusCode int, message string) (events.APIGatewayV2HTTPResponse, error) {
	errorResp := ErrorResponse{Error: message}
	body, _ := json.Marshal(errorResp)
	return events.APIGatewayV2HTTPResponse{
		StatusCode: statusCode,
		Headers:    map[string]string{contentTypeHeader: jsonContentType},
		Body:       string(body),
	}, nil
}

func createSuccessResponse(statusCode int, data interface{}) events.APIGatewayV2HTTPResponse {
	body, _ := json.Marshal(data)
	return events.APIGatewayV2HTTPResponse{
		StatusCode: statusCode,
		Headers:    map[string]string{contentTypeHeader: jsonContentType},
		Body:       string(body),
	}
}

/*****************************************************/
// Main handler function
/*****************************************************/

func handlePostConfirmation(
	event events.CognitoEventUserPoolsPostConfirmation,
) (events.CognitoEventUserPoolsPostConfirmation, error) {
	var roles = []string{}
	if customRoles, exists := event.Request.UserAttributes["custom:preferred_roles"]; exists {
		roles = parseCustomRoles(customRoles)
	} else {
		roles = []string{"Subscriber"}
		log.Println("No preferred roles found, defaulting to Subscriber for user: ", event.UserName)
	}

	userPoolId := event.UserPoolID
	for _, role := range roles {
		err := addUserToGroup(userPoolId, event.UserName, role)
		if err != nil {
			log.Printf(
				"Failed to add user %s to group %s: %v",
				event.UserName,
				role,
				err,
			)
			continue
		}
	}
	return event, nil
}

func relayToPublisherLambda(event events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	publisherFunctionName := os.Getenv("PUBLISHER_FUNCTION_NAME")

	eventJSON, err := json.Marshal(event)
	if err != nil {
		return createErrorResponse(500, "Failed to marshal event")
	}

	result, err := lambdaClient.Invoke(&awslambda.InvokeInput{
		FunctionName: aws.String(publisherFunctionName),
		Payload:      eventJSON,
	})
	if err != nil {
		log.Printf("Failed to invoke publisher lambda: %v", err)
		return createErrorResponse(500, "Failed to process publish request")
	}

	var response events.APIGatewayV2HTTPResponse
	if err := json.Unmarshal(result.Payload, &response); err != nil {
		log.Printf("Failed to unmarshal publisher response: %v", err)
		return createErrorResponse(500, "Invalid response from publisher")
	}

	return response, nil
}

func handleAPIGateway(
	event events.APIGatewayV2HTTPRequest,
) (events.APIGatewayV2HTTPResponse, error) {

	// Debug logging
	log.Printf("Received request - Method: %s, RawPath: %s, Path: %s",
		event.RequestContext.HTTP.Method, event.RawPath, event.RequestContext.HTTP.Path)

	// Check if this is a publish request using regex
	if event.RequestContext.HTTP.Method == "POST" && publishRouteRegex.MatchString(event.RawPath) {
		log.Printf("Routing to publisher lambda (matched regex pattern)")
		return relayToPublisherLambda(event)
	}

	// Handle user role management (PUT /user-role)
	if event.RequestContext.HTTP.Method == "PUT" &&
		(event.RawPath == "/user-role" || strings.HasSuffix(event.RawPath, "/user-role")) {
		log.Printf("Routing to user role update")
		return handleUserRoleUpdate(event)
	}

	log.Printf("No matching route found for Method: %s, RawPath: %s",
		event.RequestContext.HTTP.Method, event.RawPath)
	return createErrorResponse(404, "Endpoint not found")
}

func handleUserRoleUpdate(event events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	var request UpdateRoleRequest
	if err := json.Unmarshal([]byte(event.Body), &request); err != nil {
		return createErrorResponse(400, "Invalid request body")
	}
	email, err := getUserFromJWT(event)
	if err != nil {
		return createErrorResponse(500, "Unable to determine user")
	}
	// Get user pool ID from environment or use the one from Cognito config
	// For now, we'll extract from JWT issuer
	userPoolId := event.RequestContext.Authorizer.JWT.Claims["iss"]
	if userPoolId == "" {
		return createErrorResponse(500, "Unable to determine user pool")
	}
	// Extract user pool ID from issuer URL (format: https://cognito-idp.region.amazonaws.com/userPoolId)
	parts := strings.Split(userPoolId, "/")
	if len(parts) < 2 {
		return createErrorResponse(500, "Unable to determine user pool")
	}
	userPoolId = parts[len(parts)-1]

	currentGroups, err := getCurrentUserGroups(userPoolId, email)
	if err != nil {
		log.Printf("Failed to get current groups for user %s: %v", email, err)
		return createErrorResponse(500, "Failed to get current groups")
	}
	if err := removeUserFromGroups(userPoolId, email, currentGroups); err != nil {
		return createErrorResponse(500, "Failed to remove user from groups")
	}

	// Add user to new groups
	for _, role := range request.NewRole {
		// Capitalize first letter to match Cognito group names
		role = strings.ToLower(role)
		if len(role) > 0 {
			role = strings.ToUpper(role[:1]) + role[1:]
		}
		if role == "Subscriber" || role == "Publisher" {
			if err := addUserToGroup(userPoolId, email, role); err != nil {
				log.Printf("Failed to add user %s to group %s: %v", email, role, err)
				return createErrorResponse(500, "Failed to add user to group")
			}
		}
	}
	return createSuccessResponse(200, "User roles updated successfully"), nil
}

/*****************************************************/
// Lambda entry point
/*****************************************************/

func handleRequest(ctx context.Context, event json.RawMessage) (interface{}, error) {
	var eventMap map[string]interface{}
	if err := json.Unmarshal(event, &eventMap); err != nil {
		return nil, fmt.Errorf("failed to parse event: %w", err)
	}

	if requestContext, ok := eventMap["requestContext"].(map[string]interface{}); ok {
		if _, hasHTTP := requestContext["http"]; hasHTTP {
			var apiEvent events.APIGatewayV2HTTPRequest
			if err := json.Unmarshal(event, &apiEvent); err != nil {
				return nil, fmt.Errorf("failed to parse API Gateway event: %w", err)
			}
			return handleAPIGateway(apiEvent)
		}
	}

	if _, ok := eventMap["triggerSource"]; ok {
		if userPoolID, hasUserPool := eventMap["userPoolId"]; hasUserPool && userPoolID != nil {
			var cognitoEvent events.CognitoEventUserPoolsPostConfirmation
			if err := json.Unmarshal(event, &cognitoEvent); err != nil {
				return nil, fmt.Errorf("failed to parse Cognito event: %w", err)
			}
			return handlePostConfirmation(cognitoEvent)
		}
	}

	log.Printf("Unsupported event structure: %+v", eventMap)
	return nil, fmt.Errorf("unsupported event type")
}

func main() {
	lambda.Start(handleRequest)
}
