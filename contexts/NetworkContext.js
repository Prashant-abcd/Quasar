import { createContext, useContext, useEffect, useState, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';

const NetworkContext = createContext({
  isConnected: true,
  justReconnected: false,
});

export function NetworkProvider({ children }) {
  const [isConnected, setIsConnected] = useState(true);
  const [justReconnected, setJustReconnected] = useState(false);
  const wasOfflineRef = useRef(false);
  const reconnectTimerRef = useRef(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected && state.isInternetReachable !== false;

      if (!online) {
        // Going offline
        wasOfflineRef.current = true;
        setIsConnected(false);
        setJustReconnected(false);
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
      } else {
        // Coming online
        setIsConnected(true);

        if (wasOfflineRef.current) {
          // Flash "back online" for 2.5 seconds
          setJustReconnected(true);
          wasOfflineRef.current = false;

          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => {
            setJustReconnected(false);
            reconnectTimerRef.current = null;
          }, 2500);
        }
      }
    });

    return () => {
      unsubscribe();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  return (
    <NetworkContext.Provider value={{ isConnected, justReconnected }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
