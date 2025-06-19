package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

type Response events.APIGatewayProxyResponse

type ErrorResponse struct {
	Message string `json:"message"`
}

type PublishRequest struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

func handleRequest(ctx context.Context, event events.APIGatewayV2HTTPRequest) (Response, error) {
	// Extract claims from the JWT token
	claims := event.RequestContext.Authorizer.JWT.Claims
	groups, ok := claims["cognito:groups"]
	if !ok {
		return createErrorResponse(403, "Access denied. No group information found.")
	}

	// Parse groups from string array
	var groupsList []string
	if err := json.Unmarshal([]byte(groups), &groupsList); err != nil {
		return createErrorResponse(403, "Invalid group format")
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

	// Parse the request body
	var publishReq PublishRequest
	if err := json.Unmarshal([]byte(event.Body), &publishReq); err != nil {
		return createErrorResponse(400, "Invalid request body")
	}

	// Validate request
	if err := validatePublishRequest(publishReq); err != nil {
		return createErrorResponse(400, err.Error())
	}

	// TODO: Implement your publishing logic here
	// For example: Save to DynamoDB, send to S3, etc.

	log.Println("User is a publisher")

	// Return success response
	return createResponse(200, map[string]interface{}{
		"message": "User is a publisher",
		"data": map[string]string{
			"title":   publishReq.Title,
			"content": publishReq.Content,
		},
	})
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

func createErrorResponse(statusCode int, message string) (Response, error) {
	body, _ := json.Marshal(ErrorResponse{Message: message})
	return Response{
		StatusCode:      statusCode,
		IsBase64Encoded: false,
		Body:            string(body),
		Headers: map[string]string{
			"Content-Type":                "application/json",
			"Access-Control-Allow-Origin": "*",
		},
	}, nil
}

func createResponse(statusCode int, data interface{}) (Response, error) {
	body, err := json.Marshal(data)
	if err != nil {
		return createErrorResponse(500, "Error creating response")
	}

	return Response{
		StatusCode:      statusCode,
		IsBase64Encoded: false,
		Body:            string(body),
		Headers: map[string]string{
			"Content-Type":                "application/json",
			"Access-Control-Allow-Origin": "*",
		},
	}, nil
}

func main() {
	lambda.Start(handleRequest)
}
