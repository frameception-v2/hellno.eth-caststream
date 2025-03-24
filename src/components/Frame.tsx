"use client";

import { useEffect, useCallback, useState } from "react";
import { fetchGlobalCasts } from "~/lib/neynar";
import type { NeynarCast } from "~/lib/neynar";
import sdk, {
  AddFrame,
  SignIn as SignInCore,
  type Context,
} from "@farcaster/frame-sdk";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "~/components/ui/card";

import { config } from "~/components/providers/WagmiProvider";
import { truncateAddress } from "~/lib/truncateAddress";
import { base, optimism } from "wagmi/chains";
import { useSession } from "next-auth/react";
import { createStore } from "mipd";
import { Label } from "~/components/ui/label";
import { PROJECT_TITLE } from "~/lib/constants";

async function fetchRecentCasts(): Promise<NeynarCast[]> {
  try {
    const casts = await fetchGlobalCasts(25);
    return casts.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (error) {
    console.error('Error fetching casts:', error);
    return [];
  }
}

function RecentCastItem({ cast }: { cast: NeynarCast }) {
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-lg">
          {cast.author?.display_name || 'Unknown user'}
          <span className="text-sm text-gray-500 ml-2">
            @{cast.author?.username}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-base">{cast.text}</p>
        <div className="text-sm text-gray-500 mt-2">
          {new Date(cast.timestamp).toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}

function RecentCasts() {
  const [casts, setCasts] = useState<Cast[]>([]);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const loadCasts = async () => {
      try {
        const recentCasts = await fetchRecentCasts();
        setCasts(recentCasts);
        setError(''); // Clear any previous errors on success
      } catch (err) {
        let errorMessage = 'Failed to load recent casts';
        if (err instanceof Error && 'status' in err) {
          errorMessage = `API Error: ${err.status} - ${err.message}`;
        } else if (err instanceof Error) {
          errorMessage = err.message;
        }
        setError(errorMessage);
        setCasts([]); // Clear casts on error
      }
    };
    
    loadCasts();
    const interval = setInterval(loadCasts, 15000); // Refresh every 15 seconds
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  if (!casts.length) {
    return <div className="text-gray-500">Loading recent casts...</div>;
  }

  return (
    <div>
      {casts.map((cast) => (
        <RecentCastItem key={cast.hash} cast={cast} />
      ))}
    </div>
  );
}

export default function Frame() {
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [context, setContext] = useState<Context.FrameContext>();

  const [added, setAdded] = useState(false);

  const [addFrameResult, setAddFrameResult] = useState("");

  const addFrame = useCallback(async () => {
    try {
      await sdk.actions.addFrame();
    } catch (error) {
      if (error instanceof AddFrame.RejectedByUser) {
        setAddFrameResult(`Not added: ${error.message}`);
      }

      if (error instanceof AddFrame.InvalidDomainManifest) {
        setAddFrameResult(`Not added: ${error.message}`);
      }

      setAddFrameResult(`Error: ${error}`);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      const context = await sdk.context;
      if (!context) {
        return;
      }

      setContext(context);
      setAdded(context.client.added);

      // If frame isn't already added, prompt user to add it
      if (!context.client.added) {
        addFrame();
      }

      sdk.on("frameAdded", ({ notificationDetails }) => {
        setAdded(true);
      });

      sdk.on("frameAddRejected", ({ reason }) => {
        console.log("frameAddRejected", reason);
      });

      sdk.on("frameRemoved", () => {
        console.log("frameRemoved");
        setAdded(false);
      });

      sdk.on("notificationsEnabled", ({ notificationDetails }) => {
        console.log("notificationsEnabled", notificationDetails);
      });
      sdk.on("notificationsDisabled", () => {
        console.log("notificationsDisabled");
      });

      sdk.on("primaryButtonClicked", () => {
        console.log("primaryButtonClicked");
      });

      console.log("Calling ready");
      sdk.actions.ready({});

      // Set up a MIPD Store, and request Providers.
      const store = createStore();

      // Subscribe to the MIPD Store.
      store.subscribe((providerDetails) => {
        console.log("PROVIDER DETAILS", providerDetails);
        // => [EIP6963ProviderDetail, EIP6963ProviderDetail, ...]
      });
    };
    if (sdk && !isSDKLoaded) {
      console.log("Calling load");
      setIsSDKLoaded(true);
      load();
      return () => {
        sdk.removeAllListeners();
      };
    }
  }, [isSDKLoaded, addFrame]);

  if (!isSDKLoaded) {
    return <div>Loading...</div>;
  }

  return (
    <div
      style={{
        paddingTop: context?.client.safeAreaInsets?.top ?? 0,
        paddingBottom: context?.client.safeAreaInsets?.bottom ?? 0,
        paddingLeft: context?.client.safeAreaInsets?.left ?? 0,
        paddingRight: context?.client.safeAreaInsets?.right ?? 0,
      }}
    >
      <div className="w-[300px] mx-auto py-2 px-2">
        <RecentCasts />
      </div>
    </div>
  );
}
