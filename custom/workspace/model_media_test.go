/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
package workspace

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestModelMediaClassifierBuiltins(t *testing.T) {
	classifier, err := NewModelMediaClassifier(nil)
	require.NoError(t, err)

	tests := []struct {
		name      string
		model     string
		mediaType ModelMediaType
	}{
		{name: "openai text", model: "gpt-4o", mediaType: ModelMediaText},
		{name: "vision model stays text", model: "claude-3-5-sonnet-vision", mediaType: ModelMediaText},
		{name: "provider prefix and case", model: "  Google/GEMINI-2.5-Pro  ", mediaType: ModelMediaText},
		{name: "deepseek text", model: "deepseek-v4-pro", mediaType: ModelMediaText},
		{name: "qwen text", model: "Qwen/Qwen3-235B-A22B", mediaType: ModelMediaText},
		{name: "mistral text", model: "mistral-large-latest", mediaType: ModelMediaText},
		{name: "minimax text", model: "MiniMax-M2.7", mediaType: ModelMediaText},
		{name: "gpt image", model: "openai/gpt-image-1.5", mediaType: ModelMediaImage},
		{name: "gemini image", model: "gemini-3.1-flash-image-preview", mediaType: ModelMediaImage},
		{name: "flux image", model: "black-forest-labs/FLUX.1-schnell", mediaType: ModelMediaImage},
		{name: "wan image", model: "wan2.7-image-pro", mediaType: ModelMediaImage},
		{name: "bytedance seedream image", model: "ByteDance-Seedream-5.0", mediaType: ModelMediaImage},
		{name: "stable diffusion image", model: "stabilityai/stable-diffusion-3-medium", mediaType: ModelMediaImage},
		{name: "sora video", model: "sora-2-pro", mediaType: ModelMediaVideo},
		{name: "veo video", model: "google/veo-3.1-generate-preview", mediaType: ModelMediaVideo},
		{name: "seedance video", model: "doubao-seedance-2-0-260128", mediaType: ModelMediaVideo},
		{name: "hailuo video", model: "MiniMax-Hailuo-2.3-Fast", mediaType: ModelMediaVideo},
		{name: "wan image to video wins", model: "wan2.7-image-to-video", mediaType: ModelMediaVideo},
		{name: "embedding excluded", model: "text-embedding-3-large", mediaType: ModelMediaUnknown},
		{name: "audio excluded", model: "gpt-4o-audio-preview", mediaType: ModelMediaUnknown},
		{name: "rerank excluded", model: "qwen3-rerank", mediaType: ModelMediaUnknown},
		{name: "ambiguous wan stays unknown", model: "wan2.7", mediaType: ModelMediaUnknown},
		{name: "unknown family", model: "company-new-model", mediaType: ModelMediaUnknown},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			assert.Equal(t, test.mediaType, classifier.Classify(test.model))
		})
	}
}

func TestModelMediaClassifierOverridesUseFirstMatch(t *testing.T) {
	classifier, err := NewModelMediaClassifier([]ModelMediaRule{
		{Type: ModelMediaUnknown, Pattern: `(^|/)gpt-image-1$`},
		{Type: ModelMediaVideo, Pattern: `(^|/)wan2\.7$`},
		{Type: ModelMediaText, Pattern: `(^|/)company-`},
		{Type: ModelMediaImage, Pattern: `company-image`},
	})
	require.NoError(t, err)

	assert.Equal(t, ModelMediaUnknown, classifier.Classify("gpt-image-1"))
	assert.Equal(t, ModelMediaVideo, classifier.Classify("Alibaba/wan2.7"))
	assert.Equal(t, ModelMediaText, classifier.Classify("company-image-v1"))
	assert.Equal(t, ModelMediaImage, classifier.Classify("gpt-image-2"))
}

func TestNewModelMediaClassifierRejectsInvalidRules(t *testing.T) {
	tests := []struct {
		name string
		rule ModelMediaRule
	}{
		{name: "invalid type", rule: ModelMediaRule{Type: "audio", Pattern: "audio"}},
		{name: "empty pattern", rule: ModelMediaRule{Type: ModelMediaText, Pattern: "  "}},
		{name: "invalid regexp", rule: ModelMediaRule{Type: ModelMediaText, Pattern: "(?=gpt)"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := NewModelMediaClassifier([]ModelMediaRule{test.rule})
			assert.Error(t, err)
		})
	}
}

func TestParseModelMediaRulesJSONRequiresValidArray(t *testing.T) {
	rules, err := ParseModelMediaRulesJSON(`[{"type":"video","pattern":"(^|/)custom-video"}]`)
	require.NoError(t, err)
	assert.Equal(t, []ModelMediaRule{{Type: ModelMediaVideo, Pattern: `(^|/)custom-video`}}, rules)

	for _, value := range []string{"", "null", `{}`, `[{"type":"text","pattern":"("}]`} {
		_, err := ParseModelMediaRulesJSON(value)
		assert.Error(t, err, value)
	}
}
