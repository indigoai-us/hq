"use client";

import { useRouter } from "next/navigation";
import { useNavigator } from "@/hooks/useNavigator";
import { SectionHeader } from "@/components/SectionHeader";
import { TreeGroup } from "@/components/TreeGroup";
import { GlobalInputBar } from "@/components/GlobalInputBar";
import { sendGlobalMessage } from "@/services/agents";

export default function NavigatorPage() {
  const router = useRouter();
  const { groups, loading, refreshing, error, refresh, expandedNodes, toggleNode } = useNavigator();

  const handleFileSelect = (filePath: string) => {
    router.push(`/navigator/viewer?path=${encodeURIComponent(filePath)}`);
  };

  if (loading && groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-text-secondary text-sm">Loading navigator...</span>
      </div>
    );
  }

  if (error && groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <span className="text-text-secondary text-sm">{error}</span>
        <button
          type="button"
          onClick={refresh}
          className="px-4 py-2 bg-accent-blue text-text-primary text-sm font-semibold rounded-md"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <SectionHeader title="Navigator" />
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className={`text-xs text-accent-blue hover:underline ${refreshing ? "opacity-50" : ""}`}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48">
            <span className="text-3xl mb-2">📁</span>
            <span className="text-text-secondary text-sm">No items in navigator</span>
          </div>
        ) : (
          <div className="px-2 pb-4">
            {groups.map((group) => (
              <TreeGroup
                key={group.id}
                group={group}
                expandedNodes={expandedNodes}
                onToggle={toggleNode}
                onFileSelect={handleFileSelect}
              />
            ))}
          </div>
        )}
      </div>

      <GlobalInputBar
        onSend={(content) => void sendGlobalMessage(content)}
        placeholder="Ask anything..."
      />
    </div>
  );
}
