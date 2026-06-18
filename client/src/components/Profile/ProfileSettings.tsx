import { useState, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Avatar from '../common/Avatar';
import api from '../../api/axios';

interface Props { onClose: () => void; }

export default function ProfileSettings({ onClose }: Props) {
  const { user, updateUser } = useAuth();
  const [username, setUsername] = useState(user?.username || '');
  const [about, setAbout] = useState(user?.about || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await api.put('/users/me', { username, about });
      updateUser(data);
      setSuccess('Profile updated!');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update');
    } finally { setSaving(false); }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const { data } = await api.post('/users/me/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      updateUser({ avatar: data.avatar });
    } catch {
      setError('Failed to upload avatar');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden fade-in"
        style={{ background: 'var(--panel)' }}>
        <div className="bg-wa-teal text-white px-5 py-4 flex items-center gap-3">
          <button onClick={onClose} className="hover:opacity-80">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
          <h2 className="font-medium text-lg">Profile</h2>
        </div>

        <div className="p-6">
          <div className="flex flex-col items-center mb-6">
            <div className="relative">
              <Avatar src={user?.avatar} name={user?.username} size={80} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="absolute bottom-0 right-0 w-7 h-7 bg-wa-green text-white rounded-full flex items-center justify-center shadow-md hover:bg-wa-green-dark transition-colors">
                {uploading ? (
                  <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                )}
              </button>
              <input ref={fileRef} type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} />
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>Tap to change photo</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-wa-green mb-1">Your name</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                className="w-full border-b pb-2 text-sm outline-none focus:border-wa-green transition-colors bg-transparent"
                style={{ color: 'var(--text-primary)', borderColor: 'var(--separator)' }} />
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>This is your display name</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-wa-green mb-1">About</label>
              <textarea value={about} onChange={e => setAbout(e.target.value)} rows={2} maxLength={139}
                className="w-full border-b pb-2 text-sm outline-none focus:border-wa-green transition-colors resize-none bg-transparent"
                style={{ color: 'var(--text-primary)', borderColor: 'var(--separator)' }} />
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{139 - about.length} characters remaining</p>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Email</label>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{user?.email}</p>
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          {success && <p className="mt-3 text-sm text-wa-green">{success}</p>}

          <button onClick={handleSave} disabled={saving}
            className="mt-6 w-full bg-wa-green hover:bg-wa-green-dark text-white py-3 rounded-xl font-medium transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
