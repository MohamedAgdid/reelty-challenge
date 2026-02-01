import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import VideoClipCard from "./video-clip-card";

interface SortableClipProps {
  clip: any;
  index: number;
  [key: string]: any;
}

export default function SortableClip({ clip, index, ...props }: SortableClipProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: clip.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <VideoClipCard id={clip.id} videoUrl={clip.videoUrl} ratio={clip.ratio} height={clip.height} index={index} {...props} />
    </div>
  );
}
