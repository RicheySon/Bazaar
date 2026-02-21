"use client";

import { useWeb3ModalConnectorContext } from "@bch-wc2/web3modal-connector";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";

export function ConnectWalletButton() {
  const { address, connect, disconnect, isConnected } =
    useWeb3ModalConnectorContext();
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [user, setUser] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Check if user is signed in
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const shortAddress =
    address && address.length > 12
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : address;

  const handleConnect = async () => {
    if (!connect) return;
    try {
      setLoading(true);
      await connect();
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      toast({
        title: "Error",
        description: "Failed to connect wallet",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Truly connected means isConnected is true AND we have an address
  const isTrulyConnected = isConnected && !!address;

  const handleDisconnect = async () => {
    if (!disconnect) return;
    try {
      setLoading(true);
      await disconnect();
    } catch (error) {
      console.error("Failed to disconnect wallet:", error);
      // If error, force clear local storage as fallback
      if (typeof window !== "undefined") {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes("walletconnect") || key.includes("W3M") || key.includes("wagmi"))) {
            localStorage.removeItem(key);
          }
        }
        window.location.reload();
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isTrulyConnected) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleConnect}
        disabled={loading}
      >
        {loading ? "Connecting..." : "Connect Wallet"}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{shortAddress}</span>
      <Button
        variant="outline"
        size="sm"
        onClick={handleDisconnect}
        disabled={loading}
      >
        {loading ? "Disconnecting..." : "Disconnect"}
      </Button>
    </div>
  );
}



