"use client";

import { Type } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

interface DraggableTextProps {
  id: string;
  textContent: string;
  startPosition: number;
  duration: number;
  isActive: boolean;
  clipWidth: number;
  gap: number;
  totalClips: number;
  onPositionChange: (id: string, newPosition: number, newDuration?: number) => void;
  onActiveChange?: (active: boolean) => void;
  onClick?: () => void;
  zoomLevel?: number;
}

export default function DraggableText({
  id,
  textContent,
  startPosition,
  duration,
  isActive,
  clipWidth,
  gap,
  totalClips,
  onPositionChange,
  onActiveChange,
  onClick,
  zoomLevel = 1,
}: DraggableTextProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartPosition, setDragStartPosition] = useState(startPosition);
  const [dragStartDuration, setDragStartDuration] = useState(duration);
  const dragRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startX: number; startPosition: number; startDuration: number } | null>(null);

  // calculate position and width
  const xPosition = startPosition * (clipWidth + gap);
  const calculatedWidth = clipWidth * duration + gap * (duration - 1) - 15;
  const minWidth = clipWidth - 15; // minimum width is clip width
  const width = Math.max(calculatedWidth, minWidth);

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isActive) return;
    
    e.stopPropagation();
    setIsDragging(true);
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    setDragStartX(clientX);
    setDragStartPosition(startPosition);
    setDragStartDuration(duration);
    
    // prevent text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  };

  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent, side: 'left' | 'right') => {
    if (!isActive) return;
    
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(side);
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    resizeRef.current = {
      startX: clientX,
      startPosition: startPosition,
      startDuration: duration,
    };
    
    document.body.style.userSelect = 'none';
    document.body.style.cursor = side === 'left' ? 'w-resize' : 'e-resize';
  };

  const handleDragMove = (e: MouseEvent | TouchEvent) => {
    if (!isDragging && !isResizing) return;
    
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    
    if (isDragging) {
      // handle dragging
      const deltaX = clientX - dragStartX;
      const deltaPosition = deltaX / (clipWidth + gap);
      
      let newPosition = dragStartPosition + deltaPosition;
      
      // constrain to timeline bounds
      newPosition = Math.max(0, Math.min(newPosition, totalClips - duration));
      
      onPositionChange(id, newPosition, duration);
      
    } else if (isResizing && resizeRef.current) {
      // handle resizing
      const deltaX = clientX - resizeRef.current.startX;
      const deltaClips = deltaX / (clipWidth + gap);
      
      let newPosition = startPosition;
      let newDuration = duration;
      
      if (isResizing === 'right') {
        // resize from right side
        newDuration = Math.max(1, resizeRef.current.startDuration + deltaClips); // min 1 clip
        
        // ensure doesnt go beyond timeline
        const maxDuration = totalClips - startPosition;
        newDuration = Math.min(newDuration, maxDuration);
        
      } else {
        // resize from left side
        const deltaPosition = deltaClips;
        newPosition = Math.max(0, resizeRef.current.startPosition + deltaPosition);
        newDuration = Math.max(1, resizeRef.current.startDuration - deltaPosition); // min 1 clip
        
        // ensure doesnt go before timeline start
        newPosition = Math.max(0, newPosition);
        
        if (newDuration < 1) {
          newDuration = 1;
          newPosition = startPosition + duration - 1;
        }
      }
      
      onPositionChange(id, newPosition, newDuration);
    }
  };

  const handleDragEnd = () => {
    if (isDragging || isResizing) {
      setIsDragging(false);
      setIsResizing(null);
      resizeRef.current = null;
      
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
  };

  // add event listeners for drag/resize
  useEffect(() => {
    if (isDragging || isResizing) {
      const handleMouseMove = (e: MouseEvent) => handleDragMove(e);
      const handleTouchMove = (e: TouchEvent) => handleDragMove(e);
      const handleMouseUp = () => handleDragEnd();
      const handleTouchEnd = () => handleDragEnd();
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchend', handleTouchEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, isResizing, clipWidth, gap]);

  if (!isActive || !textContent) return null;

  return (
    <div className="group flex items-center px-6">
      <div 
        className="flex items-center"
        style={{ transform: `translateX(${xPosition}px)` }}
      >
        <div
          ref={dragRef}
          className={cn(
            "relative flex items-center gap-2 rounded-lg border-2 bg-white px-5 py-2 shadow-md transition-all duration-150",
            isActive 
              ? "border-[#8E2DF6] bg-white cursor-grab active:cursor-grabbing" 
              : "border-[#F5F5F5] bg-[#F5F5F5]",
            (isDragging || isResizing) && "shadow-lg scale-[1.02] z-20"
          )}
          style={{ 
            width: `${width}px`,
            minWidth: `${minWidth}px`
          }}
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          onClick={(e) => {
            if (!isDragging && !isResizing) {
              onClick?.();
            }
          }}
        >
          {/* left resize handle */}
          {isActive && (
            <div
              className="absolute -left-1.5 top-1/2 h-6 w-3 -translate-y-1/2 cursor-w-resize rounded-sm bg-[#8E2DF6] opacity-0 transition-all hover:opacity-100 active:opacity-100 group-hover:opacity-80"
              onMouseDown={(e) => handleResizeStart(e, 'left')}
              onTouchStart={(e) => handleResizeStart(e, 'left')}
            />
          )}
          
          <div className="relative flex items-center gap-2 w-full overflow-hidden">
            <button
              className={cn(
                "flex size-8 items-center justify-center rounded-md border transition-colors shrink-0",
                isActive 
                  ? "border-black bg-black text-white hover:bg-black/90" 
                  : "border-[#E9E9E9] bg-white text-[#A3A3A3]"
              )}
              onClick={(e) => { 
                e.stopPropagation(); 
                onActiveChange?.(!isActive); 
              }}
            >
              <Type size={16} className={isActive ? "text-white" : "text-[#A3A3A3]"} />
            </button>
            
            {isActive && textContent && (
              <span 
                className="text-sm whitespace-nowrap text-black truncate w-full"
                title={textContent} 
              >
                {textContent}
              </span>
            )}
          </div>
          
          {/* right resize handle */}
          {isActive && (
            <div
              className="absolute -right-1.5 top-1/2 h-6 w-3 -translate-y-1/2 cursor-e-resize rounded-sm bg-[#8E2DF6] opacity-0 transition-all hover:opacity-100 active:opacity-100 group-hover:opacity-80"
              onMouseDown={(e) => handleResizeStart(e, 'right')}
              onTouchStart={(e) => handleResizeStart(e, 'right')}
            />
          )}
          
        </div>
      </div>
    </div>
  );
}