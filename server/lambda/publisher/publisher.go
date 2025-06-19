package main

import (
	"context"
	"log"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

func main() {
	lambda.Start(handler)
}

func handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayV2HTTPResponse, error) {
	req := events.APIGatewayV2HTTPRequest{
		Headers: request.Headers,
		Body:    request.Body,
		RequestContext: events.APIGatewayV2HTTPRequestContext{
			HTTP: events.APIGatewayV2HTTPRequestContextHTTPDescription{
				Method: request.HTTPMethod,
			},
		},
		PathParameters:        request.PathParameters,
		QueryStringParameters: request.QueryStringParameters,
		RawPath:               request.Path,
	}

	log.Println("Request:", req)

	return events.APIGatewayV2HTTPResponse{
		StatusCode: 200,
		Body:       "Hello, World!",
	}, nil
}
