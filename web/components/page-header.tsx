"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h1 className="text-2xl font-extrabold">{title}</h1>
      <div className="flex items-center gap-2">
        {right}
        {onBack && (
          <Button variant="outline" size="icon" onClick={onBack}>
            <X className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
