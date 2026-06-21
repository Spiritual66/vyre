export interface User {
  id: string;
  username: string;
  email: string;
  avatar: string | null;
  about: string;
  status?: string;
  last_seen: number;
  created_at: number;
}

export interface MessageStatus {
  user_id: string;
  status: 'sent' | 'delivered' | 'read';
}

export interface Reaction {
  emoji: string;
  user_id: string;
  username: string;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string | null;
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'deleted' | 'location' | 'contact' | 'sticker';
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  reply_to: string | null;
  reply_to_message: Message | null;
  forwarded_from: string | null;
  created_at: number;
  edited_at?: number | null;
  sender_name: string;
  sender_avatar: string | null;
  statuses: MessageStatus[];
  reactions: Reaction[];
  is_starred: boolean;
}

export interface ChatSettings {
  is_pinned?: number;
  is_archived?: number;
  is_muted?: number;
  mute_until?: number | null;
  wallpaper?: string | null;
}

export interface ChatMember {
  id: string;
  username: string;
  avatar: string | null;
  about?: string;
  status?: string;
  last_seen?: number;
  role: 'admin' | 'member';
}

export interface Chat {
  id: string;
  name: string | null;
  is_group: number;
  group_avatar: string | null;
  avatar: string | null;
  description: string | null;
  created_by: string;
  created_at: number;
  last_message: string | null;
  last_message_type: string | null;
  last_message_at: number | null;
  last_message_sender: string | null;
  last_message_file_name: string | null;
  unread_count: number;
  is_pinned: number;
  is_archived: number;
  is_muted: number;
  mute_until?: number | null;
  settings?: ChatSettings;
  other_user?: User;
  members?: ChatMember[];
}

export interface StatusItem {
  id: string;
  user_id: string;
  content: string | null;
  type: 'text' | 'image' | 'video';
  file_url: string | null;
  background: string;
  font_size: number;
  expires_at: number;
  created_at: number;
  viewed: number;      // 0 or 1: whether the current viewer has seen this
  view_count: number;  // total unique viewers
  my_reaction?: string | null;   // current viewer's reaction emoji, if any
  reaction_count?: number;       // total reactions
}

export interface StatusGroup {
  user_id: string;
  username: string;
  avatar: string | null;
  muted?: boolean;     // viewer has muted this poster's status updates
  statuses: StatusItem[];
}

export interface TypingState {
  [chatId: string]: string[];
}

export interface OnlineUsers {
  [userId: string]: boolean;
}
