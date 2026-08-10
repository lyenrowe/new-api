/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
package gemini

import (
	"errors"
	"io"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
)

// GeminiNativeImageHandler converts generateContent inline images to the
// OpenAI-compatible image response used by the shared image relay.
func GeminiNativeImageHandler(c *gin.Context, info *relaycommon.RelayInfo, response *http.Response) (*dto.Usage, *types.NewAPIError) {
	body, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	_ = response.Body.Close()
	var geminiResponse dto.GeminiChatResponse
	if err := common.Unmarshal(body, &geminiResponse); err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	openAIResponse := dto.ImageResponse{Created: common.GetTimestamp(), Data: make([]dto.ImageData, 0)}
	for _, candidate := range geminiResponse.Candidates {
		for _, part := range candidate.Content.Parts {
			if part.InlineData == nil || part.InlineData.Data == "" || part.InlineData.MimeType == "" {
				continue
			}
			openAIResponse.Data = append(openAIResponse.Data, dto.ImageData{B64Json: part.InlineData.Data})
		}
	}
	if len(openAIResponse.Data) == 0 {
		return nil, types.NewOpenAIError(errors.New("Gemini returned no generated image"), types.ErrorCodeBadResponseBody, http.StatusBadGateway)
	}
	encoded, err := common.Marshal(openAIResponse)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	c.Header("Content-Type", "application/json")
	c.Status(response.StatusCode)
	_, _ = c.Writer.Write(encoded)
	usage := buildUsageFromGeminiResponse(c, info, &geminiResponse)
	return &usage, nil
}
