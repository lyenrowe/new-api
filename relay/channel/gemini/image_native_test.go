/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
package gemini

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConvertNativeGeminiImageRequestPreservesImageConfiguration(t *testing.T) {
	request := dto.ImageRequest{
		Model:   "gemini-3.1-flash-image-preview",
		Prompt:  "a paper-cut city",
		Size:    "21:9",
		Quality: "4K",
		Image:   []byte(`"https://cdn.example.com/reference.png"`),
	}
	converted, err := (&Adaptor{}).ConvertImageRequest(nil, &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: request.Model}}, request)
	require.NoError(t, err)
	geminiRequest, ok := converted.(dto.GeminiChatRequest)
	require.True(t, ok)
	require.Len(t, geminiRequest.Contents, 1)
	require.Len(t, geminiRequest.Contents[0].Parts, 2)
	assert.Equal(t, []string{"IMAGE"}, geminiRequest.GenerationConfig.ResponseModalities)
	assert.JSONEq(t, `{"aspectRatio":"21:9","imageSize":"4K"}`, string(geminiRequest.GenerationConfig.ImageConfig))
	assert.Equal(t, "https://cdn.example.com/reference.png", geminiRequest.Contents[0].Parts[1].FileData.FileUri)
}
