import Image from "next/image";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface BookCoverImageProps {
  alt: string;
  src?: string | null;
  className?: string;
  imageClassName?: string;
  iconClassName?: string;
  priority?: boolean;
  sizes?: string;
}

export function BookCoverImage({
  alt,
  src,
  className,
  imageClassName,
  iconClassName,
  priority = false,
  sizes = "(max-width: 768px) 96px, 112px",
}: BookCoverImageProps) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-white/5", className)}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className={cn("object-cover", imageClassName)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <BookOpen className={cn("h-6 w-6 text-text-muted/30", iconClassName)} />
        </div>
      )}
    </div>
  );
}
