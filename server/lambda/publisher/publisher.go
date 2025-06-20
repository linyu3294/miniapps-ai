package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

type Response events.APIGatewayV2HTTPResponse

const (
	contentTypeHeader = "Content-Type"
	jsonContentType   = "application/json"
)

type PublishRequest struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

func validatePublisher(request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	// Extract claims from the JWT token
	claims := request.RequestContext.Authorizer.JWT.Claims
	groupsClaim, ok := claims["cognito:groups"]
	if !ok {
		return createErrorResponse(403, "Access denied. No group information found.")
	}

	// The 'cognito:groups' claim from API Gateway comes as a string representation
	// of a slice, e.g., "[Publisher, Admin]". It is not valid JSON.
	// We need to parse this string manually.
	if !strings.HasPrefix(groupsClaim, "[") || !strings.HasSuffix(groupsClaim, "]") {
		log.Println("Group claim is not in the expected format '[...]'")
		return createErrorResponse(403, "Invalid group format in token.")
	}

	trimmedGroups := groupsClaim[1 : len(groupsClaim)-1]
	var groupsList []string
	if trimmedGroups != "" {
		groupsList = strings.Split(trimmedGroups, ", ")
	} else {
		groupsList = []string{}
	}

	isPublisher := false
	for _, group := range groupsList {
		if group == "Publisher" {
			isPublisher = true
			break
		}
	}
	if !isPublisher {
		return createErrorResponse(403, "Access denied. Publisher role required.")
	}

	return events.APIGatewayV2HTTPResponse{}, nil
}

func validatePublishRequest(req PublishRequest) error {
	if req.Title == "" {
		return errors.New("title is required")
	}
	if req.Content == "" {
		return errors.New("content is required")
	}
	return nil
}

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

func handleRequest(ctx context.Context, event events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	_, err := validatePublisher(event)
	if err != nil {
		return createErrorResponse(403, err.Error())
	}

	var publishReq PublishRequest
	if err := json.Unmarshal([]byte(event.Body), &publishReq); err != nil {
		return createErrorResponse(400, "Invalid request body")
	}

	if err := validatePublishRequest(publishReq); err != nil {
		return createErrorResponse(400, err.Error())
	}

	// TODO: Implement your publishing logic here
	// For example: Save to DynamoDB, send to S3, etc.

	log.Println("User is a publisher")
	// Return success response
	return createSuccessResponse(200, map[string]interface{}{"message": "Content published successfully"}), nil
}

func main() {
	lambda.Start(handleRequest)
}
