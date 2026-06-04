declare module '@rails/actioncable' {
  interface SubscriptionCallbacks {
    received?: (data: unknown) => void;
    connected?: () => void;
    disconnected?: () => void;
    rejected?: () => void;
  }

  class Subscription {
    unsubscribe(): void;
  }

  class Subscriptions {
    create(channel: string | object, callbacks?: SubscriptionCallbacks): Subscription;
  }

  class Consumer {
    subscriptions: Subscriptions;
    disconnect(): void;
  }

  const adapters: {
    WebSocket: typeof WebSocket;
  };

  function createConsumer(url?: string): Consumer;
  function getConfig(name: string): string | null;
}
