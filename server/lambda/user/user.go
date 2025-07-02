package main

import (
	"context"
	"log"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/cognitoidentityprovider"
)

/*****************************************************/
// AWS Services
/*****************************************************/

var cognitoClient *cognitoidentityprovider.CognitoIdentityProvider

func init() {
	sess := session.Must(session.NewSession())
	cognitoClient = cognitoidentityprovider.New(sess)
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
		log.Printf("Error adding user %s to group %s: %v", username, groupName, err)
		return err
	}

	log.Printf("Successfully added user %s to group %s", username, groupName)
	return nil
}

func parsePreferredRoles(rolesString string) []string {
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

/*****************************************************/
// Main handler function
/*****************************************************/

func handlePostConfirmation(ctx context.Context, event events.CognitoEventUserPoolsPostConfirmation) (events.CognitoEventUserPoolsPostConfirmation, error) {
	log.Printf("Processing Post Confirmation for user: %s", event.UserName)

	// Extract preferred roles from user attributes
	preferredRoles := ""
	if customRoles, exists := event.Request.UserAttributes["custom:preferred_roles"]; exists {
		preferredRoles = customRoles
	}

	log.Printf("User %s preferred roles: %s", event.UserName, preferredRoles)

	// Parse the roles
	roles := parsePreferredRoles(preferredRoles)

	// Add user to each selected group
	userPoolId := event.UserPoolID
	for _, role := range roles {
		err := addUserToGroup(userPoolId, event.UserName, role)
		if err != nil {
			log.Printf("Failed to add user %s to group %s: %v", event.UserName, role, err)
			// Continue with other roles even if one fails
		}
	}

	log.Printf("Post Confirmation processing completed for user: %s", event.UserName)

	// Return the event unchanged (required for Cognito triggers)
	return event, nil
}

/*****************************************************/
// Lambda entry point
/*****************************************************/

func main() {
	lambda.Start(handlePostConfirmation)
}
