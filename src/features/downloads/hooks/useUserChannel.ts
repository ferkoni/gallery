import { useEffect } from 'react';
import { createConsumer, adapters } from '@rails/actioncable';
import { useAuthContext } from '@/features/auth/hooks/useAuthContext';
import { useDownloadStore } from '../store/downloadStore';

type ChannelMessage = {
  task_type: string;
  task_id: number;
  status: 'ready' | 'failed';
  album_name: string;
  url?: string;
  error?: string;
};

export function useUserChannel() {
  const { token } = useAuthContext();

  useEffect(() => {
    if (!token) return;

    const apiUrl = import.meta.env.VITE_API_URL ?? '';
    const wsUrl = apiUrl.replace(/^http/, 'ws') + '/cable';

    // Inject the JWT as a WebSocket subprotocol so it never appears in server
    // access logs or browser history (tokens in URLs are routinely logged).
    const OriginalWebSocket = adapters.WebSocket;
    class TokenWebSocket extends OriginalWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        const protos = Array.isArray(protocols) ? [...protocols] : protocols ? [protocols] : [];
        super(url, [...protos, `token.${token}`]);
      }
    }
    adapters.WebSocket = TokenWebSocket;

    const consumer = createConsumer(wsUrl);
    const subscription = consumer.subscriptions.create('UserChannel', {
      received(raw: unknown) {
        const data = raw as ChannelMessage;
        if (data.task_type !== 'album_download') return;
        if (data.status === 'ready' && data.url) {
          useDownloadStore.getState().setReady(data.task_id, data.url);
        } else if (data.status === 'failed') {
          useDownloadStore.getState().setFailed(data.task_id, data.error ?? 'Download failed');
        }
      },
    });

    adapters.WebSocket = OriginalWebSocket;

    return () => {
      subscription.unsubscribe();
      consumer.disconnect();
    };
  }, [token]);
}
