import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';

// Isolated so @emoji-mart (+ its large emoji dataset) is code-split into its own
// chunk and only downloaded when the user actually opens the emoji picker.
export default function EmojiPicker({ onEmojiSelect }: { onEmojiSelect: (emoji: any) => void }) {
  return <Picker data={data} onEmojiSelect={onEmojiSelect} theme="auto" previewPosition="none" />;
}
