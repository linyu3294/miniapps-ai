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

/*****************************************************/
// Main handler function
/*****************************************************/

func handlePostConfirmation(
	ctx context.Context,
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

/*****************************************************/
// Lambda entry point
/*****************************************************/

func main() {
	lambda.Start(handlePostConfirmation)
}
