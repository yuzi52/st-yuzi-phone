// One vocabulary for prompts, person images and dialogue labels.
export const BODY_DIALOGUE_EMOTIONS = Object.freeze([
    { id: 'joy', label: '开心', color: '#f59e0b' },
    { id: 'anger', label: '生气', color: '#ef4444' },
    { id: 'sad', label: '难过', color: '#3b82f6' },
    { id: 'anxious', label: '紧张', color: '#eab308' },
    { id: 'calm', label: '平静', color: '#22c55e' },
    { id: 'shy', label: '害羞', color: '#06b6d4' },
    { id: 'disgust', label: '嫌弃', color: '#8b5cf6' },
    { id: 'love', label: '心动', color: '#ec4899' },
]);

export const getBodyDialogueEmotion = label => BODY_DIALOGUE_EMOTIONS.find(emotion => emotion.label === label);
