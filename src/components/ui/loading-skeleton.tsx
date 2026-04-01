"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-pulse">
      <div className="flex justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </div>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-8">
            <Skeleton className="h-[140px] w-[140px] rounded-full" />
            <div className="flex gap-8">
              <Skeleton className="h-[100px] w-[100px] rounded-full" />
              <Skeleton className="h-[100px] w-[100px] rounded-full" />
            </div>
            <div className="flex-1 grid grid-cols-2 gap-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-8 w-20 mb-2" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-pulse">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-10 w-96" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardContent className="p-6 flex flex-col items-center gap-4">
            <Skeleton className="h-[160px] w-[160px] rounded-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardContent className="p-6 space-y-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-3 w-64" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
