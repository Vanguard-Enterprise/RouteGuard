import { Badge } from "@/components/ui/badge";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  inactive: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  graduated: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  archived: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  maintenance: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  retired: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  in_progress: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  morning: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  afternoon: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  field_trip: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  activity: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  queued: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  delivered: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  board: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  exit: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-800";
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Badge variant="secondary" className={`${style} ${className ?? ""}`}>
      {label}
    </Badge>
  );
}
