package main

import (
	"context"
	"encoding/json"
	"log"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

/*****************************************************/
// Other types
/*****************************************************/

type Response events.APIGatewayV2HTTPResponse

const (
	contentTypeHeader = "Content-Type"
	jsonContentType   = "application/json"
)

type ErrorResponse struct {
	Error string `json:"error"`
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
// Main function
/*****************************************************/

func handleRequest(ctx context.Context, request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	log.Println("API Gateway event detected, processing as a publish request...")
	return createSuccessResponse(200, "Hello, world!"), nil
}

func main() {
	lambda.Start(handleRequest)
}
