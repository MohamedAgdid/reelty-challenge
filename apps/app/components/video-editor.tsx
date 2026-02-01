"use client";

import { getClipWidth, GAP_BETWEEN_CLIPS, getConstrainedHeight } from "@/data/constants";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePinchZoom } from "@/hooks/use-pinch-zoom";
import DraggableText from "./draggable-text";
import StaticTextOverlay from "./static-text-overlay";
import { SAMPLE_VIDEOS } from "@/data/sample-videos";
import VideoClipCard from "./video-clip-card";
import { twMerge } from "tailwind-merge";
import Magnifier from "./magnifier";
import { Plus } from "lucide-react";
import TextDock from "./text-dock";
import { snapToClipBoundaries, snapTextEdges, Clip } from "@/lib/timeline-utils";
import { RenderButton } from "./render-button";
import { replaceAnimationPlaceholder } from "@/server/utils";
import { trpc } from "@/api/client";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import SortableClip from "./sortable-clip";



export default function tchVideoEditor() {
  const ratio: "portrait" | "landscape" = "portrait";
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const clipsScrollContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [textInput, setTextInput] = useState("");
  const [appliedText, setAppliedText] = useState("");
  const [selectedTextAnimation, setSelectedTextAnimation] = useState<string | null>(null);
  const [isTextOpen, setIsTextOpen] = useState(false);
  const [isTextActive, setIsTextActive] = useState(false);
  const [textStartPosition, setTextStartPosition] = useState(0); // start at clip 1 (position 0)
  const [textClipCount, setTextClipCount] = useState(1); // default: 1 clip
  const [textId] = useState(() => `text-overlay-${Date.now()}`);
  const [selectedAnimationData, setSelectedAnimationData] = useState<any | null>(null);


  const [activeClips, setActiveClips] = useState(SAMPLE_VIDEOS.map((video, index) => ({
    ...video,
    startPosition: index,
  })));
  const [removedClips, setRemovedClips] = useState<typeof SAMPLE_VIDEOS>([]);

  const handleZoomChange = useCallback((newZoom: number) => {
    setZoomLevel(newZoom);
  }, []);
  
  const { setZoom: setPinchZoom } = usePinchZoom({
    minZoom: 0.33,
    maxZoom: 2.22,
    sensitivity: 0.08,
    onZoomChange: handleZoomChange,
    containerRef,
  });

  useEffect(() => {
    setPinchZoom(zoomLevel);
  }, [zoomLevel, setPinchZoom]);

  const clipWidth = getClipWidth(ratio, zoomLevel);
  const constrainedHeight = getConstrainedHeight(ratio, zoomLevel);
 
  const { data: templates } = trpc.textTemplates.getAll.useQuery();

 const handleApplyText = () => {
  if (textInput && selectedTextAnimation && templates) {
    setAppliedText(textInput);
    setIsTextActive(true);
    setIsTextOpen(false);

    setTextStartPosition(0);
    setTextClipCount(Math.min(2, activeClips.length));

    const foundTemplate = templates.find(t => t.key === selectedTextAnimation);
    if (foundTemplate?.content) {
      const animData = replaceAnimationPlaceholder(foundTemplate.content, textInput);
      setSelectedAnimationData(animData);
    }
  }
};



  const handleResetText = () => {
    setTextInput("");
    setAppliedText("");
    setSelectedTextAnimation(null);
    setSelectedAnimationData(null);
    setIsTextActive(false);
    setTextStartPosition(0);
    setTextClipCount(1);
  };

  const handleTextClick = () => setIsTextOpen(true);

  // convert active clips to clip interface for snapping
  const getClipsAsClipArray = (): Clip[] => {
    return activeClips.map((clip, index) => ({
      id: clip.id,
      startPosition: index,
      duration: 1,
    }));
  };

  // handle text position & duration changes with snapping
  const handleTextChange = (id: string, newPosition: number, newDuration?: number) => {
    const clips = getClipsAsClipArray();
    
    // if duration changed, snap both edges
    if (newDuration !== undefined) {
      const { snappedStart, snappedDuration } = snapTextEdges(
        newPosition,
        newDuration,
        clips,
        0.3
      );
      
      // apply constraints
      const maxStart = Math.max(0, activeClips.length - snappedDuration);
      const clampedStart = Math.max(0, Math.min(snappedStart, maxStart));
      
      setTextStartPosition(clampedStart);
      setTextClipCount(snappedDuration);
      
    } else {
      // only position changed, snap just the start
      const snappedPosition = snapToClipBoundaries(newPosition, clips, 0.3);
      
      // ensure text doesnt go beyond timeline
      const maxPosition = Math.max(0, activeClips.length - textClipCount);
      const clampedPosition = Math.max(0, Math.min(snappedPosition, maxPosition));
      
      setTextStartPosition(clampedPosition);
    }
  };

  const handleRemoveClip = (id: string) => {
    const clipIndex = activeClips.findIndex((c) => c.id === id);
    if (clipIndex >= 0) {
      const clip = activeClips[clipIndex];
      const newActiveClips = activeClips.filter((c) => c.id !== id);
      setActiveClips(newActiveClips);
      setRemovedClips([...removedClips, clip]);
      
      // adjust text position if needed
      if (textStartPosition >= newActiveClips.length - textClipCount) {
        const newMax = Math.max(0, newActiveClips.length - textClipCount);
        setTextStartPosition(Math.min(textStartPosition, newMax));
      }
      
      // if text spans the removed clip, adjust duration
      if (clipIndex >= textStartPosition && clipIndex < textStartPosition + textClipCount) {
        const newDuration = Math.max(1, textClipCount - 1);
        setTextClipCount(newDuration);
      }
    }
  };

  const handleAddClip = (id: string) => {
    const clip = removedClips.find((c) => c.id === id);
    if (clip) {
      setRemovedClips(removedClips.filter((c) => c.id !== id));
      const newActiveClips = [...activeClips, { ...clip, startPosition: activeClips.length, duration: 1 }];
      setActiveClips(newActiveClips);
    }
  };

  const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
);

const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;

  const oldIndex = activeClips.findIndex(c => c.id === active.id);
  const newIndex = activeClips.findIndex(c => c.id === over.id);

  const updatedClips = [...activeClips];
  const [movedClip] = updatedClips.splice(oldIndex, 1);
  updatedClips.splice(newIndex, 0, movedClip);

  setActiveClips(updatedClips);
};

  return (
    <div className="flex h-full max-h-full flex-col overflow-hidden">
      <div className="shrink-0 p-6 md:px-8 md:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1">
              <p className="text-lg font-medium">Edit</p>
            </div>
            <div className="size-1.5 rounded-full bg-[#D9D9D9]" />
            <div className="flex items-center space-x-1">
              <p className="line-clamp-1">Video Editor</p>
            </div>
          </div>
          <div className="hidden md:flex">
            <Magnifier 
              onZoomChange={handleZoomChange} 
              initialZoom={zoomLevel} 
              ratio={ratio} 
              isLoading={false} 
              externalZoom={zoomLevel} 
            />
          </div>
        </div>
      </div>

      <TextDock
        isOpen={isTextOpen}
        setIsOpen={setIsTextOpen}
        textInput={textInput}
        setTextInput={setTextInput}
        selectedTextAnimation={selectedTextAnimation}
        setSelectedTextAnimation={setSelectedTextAnimation}
        onApplyText={handleApplyText}
        onReset={handleResetText}
        hasAppliedText={appliedText.trim().length > 0}
      />

      <div
        ref={containerRef}
        className="scrollbar scrollbar-w-1.5 scrollbar-thumb-[#E9E9E9] scrollbar-thumb-rounded-full scrollbar-hover:scrollbar-thumb-black relative flex flex-1 flex-col justify-center overflow-hidden overflow-y-auto rounded-3xl border border-[#F6F6F6] bg-white md:flex"
      >
        {/* show StaticTextOverlay when text is inactive */}
        {!isTextActive ? (
          <StaticTextOverlay
            textContent={appliedText}
            startPosition={textStartPosition}
            duration={textClipCount}
            isActive={isTextActive}
            totalClips={activeClips.length}
            clipWidth={clipWidth}
            gap={GAP_BETWEEN_CLIPS}
            onClick={handleTextClick}
          />
        ) : (
          /* show DraggableText when text is active */
          <DraggableText
            id={textId}
            textContent={appliedText}
            startPosition={textStartPosition}
            duration={textClipCount}
            isActive={isTextActive}
            clipWidth={clipWidth}
            gap={GAP_BETWEEN_CLIPS}
            totalClips={activeClips.length}
            zoomLevel={zoomLevel}
            onPositionChange={handleTextChange}
            onActiveChange={setIsTextActive}
            onClick={handleTextClick}
          />
        )}

        <div
          ref={clipsScrollContainerRef}
          className={twMerge(
            "scrollbar scrollbar-h-1.5 scrollbar-thumb-[#E9E9E9] scrollbar-thumb-rounded-full scrollbar-hover:scrollbar-thumb-black mx-6 mb-2.5 overflow-x-auto pt-10 pb-6",
            isTextOpen && "opacity-10"
          )}
        >
          <div className="flex w-full items-center gap-4">
           <DndContext
             sensors={sensors}
             collisionDetection={closestCenter}
             onDragEnd={handleDragEnd}
            >
          <SortableContext
            items={activeClips.map(c => c.id)}
            strategy={horizontalListSortingStrategy}
           >
         {activeClips.map((clip, index) => (
          <SortableClip
           key={clip.id}
           clip={clip}
           index={index}
           videoUrl={clip.url}
           ratio={ratio}
           height={constrainedHeight}
           onRemove={handleRemoveClip}
           onAdd={handleAddClip}
           />
           ))}
          </SortableContext>
          </DndContext>

            {removedClips.length > 0 && (
              <div className="mx-4">
                <div className={twMerge("flex size-11 items-center justify-center rounded-lg border", "border-[#EDEDED] bg-[#FBFBFB] shadow-md")}>
                  <Plus size={24} className="text-[#A3A3A3] duration-300" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 p-6 md:px-8 md:py-4">
        <RenderButton
          clips={activeClips} 
          ratio={ratio} 
          textOverlay={isTextActive && selectedAnimationData ? {
            id: textId,
            content: appliedText,
            startPosition: textStartPosition,
            duration: textClipCount,
            animation: selectedAnimationData,
          } : null}
        />
      </div>
    </div>
  );
}

