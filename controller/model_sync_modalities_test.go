package controller

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildUpstreamModalitiesMergesProviderVariants(t *testing.T) {
	providers := map[string]upstreamCatalogProvider{
		"global": {Models: map[string]upstreamCatalogModel{"omni-model": {
			ID: "omni-model",
			Modalities: upstreamModalities{
				Input:  []string{"text", "image", "video"},
				Output: []string{"text"},
			},
		}}},
		"regional": {Models: map[string]upstreamCatalogModel{"omni-model": {
			ID: "omni-model",
			Modalities: upstreamModalities{
				Input:  []string{"text", "audio"},
				Output: []string{"audio", "text"},
			},
		}}},
	}

	modalities, err := buildUpstreamModalities(providers)
	require.NoError(t, err)
	assert.Equal(t, []string{"text", "image", "audio", "video"}, modalities["omni-model"].Input)
	assert.Equal(t, []string{"text", "audio"}, modalities["omni-model"].Output)
}

func TestBuildUpstreamModalitiesRejectsUnknownValues(t *testing.T) {
	providers := map[string]upstreamCatalogProvider{
		"provider": {Models: map[string]upstreamCatalogModel{"bad-model": {
			ID:         "bad-model",
			Modalities: upstreamModalities{Output: []string{"binary"}},
		}}},
	}

	_, err := buildUpstreamModalities(providers)
	require.ErrorContains(t, err, "invalid output modalities")
}

func TestDecodeUpstreamModalitiesSupportsModelsObjectShape(t *testing.T) {
	modalities, err := decodeUpstreamModalities([]byte(`{
		"provider": {
			"models": {
				"image-model": {
					"id": "image-model",
					"modalities": {"input": ["text"], "output": ["image"]}
				}
			}
		}
	}`))
	require.NoError(t, err)
	assert.Equal(t, []string{"text"}, modalities["image-model"].Input)
	assert.Equal(t, []string{"image"}, modalities["image-model"].Output)
}
