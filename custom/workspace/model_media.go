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
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

type ModelMediaType string

const (
	ModelMediaText    ModelMediaType = KindText
	ModelMediaImage   ModelMediaType = KindImage
	ModelMediaVideo   ModelMediaType = KindVideo
	ModelMediaUnknown ModelMediaType = "unknown"
)

type ModelMediaRule struct {
	Type    ModelMediaType `json:"type"`
	Pattern string         `json:"pattern"`
}

type compiledModelMediaRule struct {
	mediaType ModelMediaType
	pattern   *regexp.Regexp
}

type ModelMediaClassifier struct {
	overrides []compiledModelMediaRule
}

var videoModelPatterns = compileBuiltinModelPatterns([]string{
	`(^|[-_/])(image-to-video|image2video)([-_.]|$)`,
	`(^|/)sora([-.]|$)`,
	`(^|/)veo-`,
	`(^|/)(doubao-)?seedance-`,
	`(^|/)kling([-.]|$)`,
	`(^|/)grok-imagine-video([-.]|$)`,
	`(^|/)(minimax-)?hailuo([-.]|$)`,
	`(^|/)(t2v|i2v)-01([-.]|$)`,
	`(^|/)wanx?[0-9][0-9.]*-(t2v|i2v|kf2v|s2v|vace)([-.]|$)`,
	`(^|/)(runway[-/])?(gen3a|gen-?3|gen4|gen-?4)([-_.]|$)`,
	`(^|/)(luma[-/])?ray-?2([-.]|$)`,
	`(^|/)vidu(q?[0-9]|[-.])`,
	`(^|/)(hunyuan[-_]?video|hunyuanvideo|cogvideo|pika|pixverse|jimeng_vgfm|stable-video|mochi)([-_./]|$)`,
})

var imageModelPatterns = compileBuiltinModelPatterns([]string{
	`(^|/)(gpt-image|chatgpt-image|dall-e)([-.]|$)`,
	`(^|/)imagen-`,
	`(^|/)gemini-[^/]*-image([-.]|$)`,
	`(^|/)nano-banana([-.]|$)`,
	`(^|/)(grok-imagine-image|grok-2-image)([-.]|$)`,
	`(^|/)(bytedance-|doubao-)?seedream([-.]|$)`,
	`(^|/)qwen-image([-.]|$)`,
	`(^|/)wanx?[0-9][0-9.]*-(image|t2i|i2i)([-.]|$)`,
	`(^|/)flux([-.]|$)`,
	`(^|/)(stable-image|stable-diffusion|sd3)([-_.]|$)`,
	`(^|/)(midjourney|ideogram|recraft|firefly|photon|cogview|kolors|hunyuan[-_]?image|hidream|pixart|z-image)([-_./]|$)`,
	`(^|/)(minimax[-/])?image-01([-.]|$)`,
})

var unsupportedModelPatterns = compileBuiltinModelPatterns([]string{
	`(^|[-_./])(embedding|embed|rerank|moderation|transcribe|tts|speech|audio|realtime|whisper|music|ocr)([-_./]|$)`,
})

var textModelPatterns = compileBuiltinModelPatterns([]string{
	`(^|/)(gpt-|chatgpt([-.]|$)|o[134]([-.]|$))`,
	`(^|[/.])claude([-.]|$)`,
	`(^|/)(gemini|gemma|grok|deepseek)([-.]|$)`,
	`(^|/)(qwen[0-9-]|qwq)([-.]|$)`,
	`(^|/)(llama|mistral|mixtral|ministral|magistral|codestral|devstral)([-.]|$)`,
	`(^|/)(command|aya|doubao|ernie|glm|kimi|moonshot)([-.]|$)`,
	`(^|/)minimax-(m[0-9]|text)([-.]|$)`,
	`(^|/)(yi|baichuan|hunyuan|spark|step|internlm|phi|nova|jamba|dbrx|falcon)([-.]|$)`,
	`(^|[/.])nova([-.]|$)`,
})

func compileBuiltinModelPatterns(patterns []string) []*regexp.Regexp {
	compiled := make([]*regexp.Regexp, 0, len(patterns))
	for _, pattern := range patterns {
		compiled = append(compiled, regexp.MustCompile(pattern))
	}
	return compiled
}

func NewModelMediaClassifier(overrides []ModelMediaRule) (*ModelMediaClassifier, error) {
	compiled := make([]compiledModelMediaRule, 0, len(overrides))
	for index, rule := range overrides {
		if !validModelMediaType(rule.Type) {
			return nil, fmt.Errorf("workspace model media rule %d has invalid type %q", index+1, rule.Type)
		}
		pattern := strings.TrimSpace(rule.Pattern)
		if pattern == "" {
			return nil, fmt.Errorf("workspace model media rule %d has an empty pattern", index+1)
		}
		compiledPattern, err := regexp.Compile(pattern)
		if err != nil {
			return nil, fmt.Errorf("workspace model media rule %d has an invalid pattern: %w", index+1, err)
		}
		compiled = append(compiled, compiledModelMediaRule{mediaType: rule.Type, pattern: compiledPattern})
	}
	return &ModelMediaClassifier{overrides: compiled}, nil
}

func ParseModelMediaRulesJSON(value string) ([]ModelMediaRule, error) {
	if strings.TrimSpace(value) == "" {
		return nil, errors.New("workspace model media rules must be a JSON array")
	}
	var rules []ModelMediaRule
	if err := common.UnmarshalJsonStr(value, &rules); err != nil {
		return nil, fmt.Errorf("invalid workspace model media rules: %w", err)
	}
	if rules == nil {
		return nil, errors.New("workspace model media rules must be a JSON array")
	}
	if _, err := NewModelMediaClassifier(rules); err != nil {
		return nil, err
	}
	return rules, nil
}

func (classifier *ModelMediaClassifier) Classify(modelName string) ModelMediaType {
	name := strings.ToLower(strings.TrimSpace(modelName))
	if name == "" {
		return ModelMediaUnknown
	}
	for _, rule := range classifier.overrides {
		if rule.pattern.MatchString(name) {
			return rule.mediaType
		}
	}
	if matchesModelPattern(videoModelPatterns, name) {
		return ModelMediaVideo
	}
	if matchesModelPattern(imageModelPatterns, name) {
		return ModelMediaImage
	}
	if matchesModelPattern(unsupportedModelPatterns, name) {
		return ModelMediaUnknown
	}
	if matchesModelPattern(textModelPatterns, name) {
		return ModelMediaText
	}
	return ModelMediaUnknown
}

func matchesModelPattern(patterns []*regexp.Regexp, modelName string) bool {
	for _, pattern := range patterns {
		if pattern.MatchString(modelName) {
			return true
		}
	}
	return false
}

func validModelMediaType(mediaType ModelMediaType) bool {
	return mediaType == ModelMediaText || mediaType == ModelMediaImage || mediaType == ModelMediaVideo || mediaType == ModelMediaUnknown
}
