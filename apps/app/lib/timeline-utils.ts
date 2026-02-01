export interface Clip {
  id: string;
  startPosition: number; // index in timeline
  duration: number; // in clip units
}

export interface TextOverlay {
  id: string;
  content: string;
  startPosition: number;
  duration: number; // in clip units
}

/**
 * get all possible snap points (clip starts & ends)
 */
export function getAllSnapPoints(clips: Clip[]): number[] {
  const snapPoints: number[] = [];
  
  if (clips.length === 0) return [0, 1]; // default timeline
  
  // add start of timeline (position 0)
  snapPoints.push(0);
  
  // add all clip boundaries
  clips.forEach((clip, index) => {
    // clip start
    snapPoints.push(clip.startPosition);
    // clip end
    snapPoints.push(clip.startPosition + clip.duration);
  });
  
  // add end of timeline (position after last clip)
  const lastClip = clips[clips.length - 1];
  const timelineEnd = lastClip.startPosition + lastClip.duration;
  snapPoints.push(timelineEnd);
  
  // remove duplicates, sort, and return
  return [...new Set(snapPoints)].sort((a, b) => a - b);
}

/**
 * snap text position to nearest clip boundary (start or end)
 */
export function snapToClipBoundaries(
  position: number,
  clips: Clip[],
  snapThreshold: number = 0.3 // snap within 0.3 clip units
): number {
  const snapPoints = getAllSnapPoints(clips);
  
  if (snapPoints.length === 0) return position;
  
  // find closest snap point
  const closest = snapPoints.reduce((prev, curr) =>
    Math.abs(curr - position) < Math.abs(prev - position) ? curr : prev
  );
  
  // only snap if within threshold
  return Math.abs(closest - position) <= snapThreshold ? closest : position;
}

/**
 * snap both text edges to nearest boundaries
 */
export function snapTextEdges(
  textStart: number,
  textDuration: number,
  clips: Clip[],
  snapThreshold: number = 0.3
): { snappedStart: number; snappedDuration: number } {
  const textEnd = textStart + textDuration;
  const snapPoints = getAllSnapPoints(clips);
  
  if (snapPoints.length === 0) {
    return { snappedStart: textStart, snappedDuration: textDuration };
  }
  
  // find closest snap point for text start
  const closestStart = snapPoints.reduce((prev, curr) =>
    Math.abs(curr - textStart) < Math.abs(prev - textStart) ? curr : prev
  );
  
  // find closest snap point for text end
  const closestEnd = snapPoints.reduce((prev, curr) =>
    Math.abs(curr - textEnd) < Math.abs(prev - textEnd) ? curr : prev
  );
  
  // apply snapping only if within threshold
  const snappedStart = Math.abs(closestStart - textStart) <= snapThreshold 
    ? closestStart 
    : textStart;
    
  const snappedEnd = Math.abs(closestEnd - textEnd) <= snapThreshold 
    ? closestEnd 
    : textEnd;
  
  // ensure valid duration (minimum 0.1 for visual display)
  const snappedDuration = Math.max(0.1, snappedEnd - snappedStart);
  
  return {
    snappedStart: Math.max(0, snappedStart),
    snappedDuration,
  };
}

/**
 * calculate text width based on covered clips
 */
export function calculateTextWidthInClips(
  textStart: number,
  textDuration: number,
  clips: Clip[],
  clipWidth: number,
  gap: number
): number {
  if (clips.length === 0) return clipWidth;
  
  const textEnd = textStart + textDuration;
  
  // find clips that the text covers
  const coveredClips = clips.filter(clip => {
    const clipEnd = clip.startPosition + clip.duration;
    return clip.startPosition < textEnd && clipEnd > textStart;
  });
  
  if (coveredClips.length === 0) return clipWidth;
  
  // sort clips by position
  const sortedClips = [...coveredClips].sort((a, b) => a.startPosition - b.startPosition);
  
  const firstClip = sortedClips[0];
  const lastClip = sortedClips[sortedClips.length - 1];
  
  // calculate total width from first to last clip
  const widthFromFirst = (lastClip.startPosition - firstClip.startPosition) * (clipWidth + gap);
  
  // add width for partial coverage at ends
  let totalWidth = widthFromFirst + clipWidth;
  
  // adjust for partial coverage at start
  if (textStart > firstClip.startPosition) {
    const startClipCoverage = 1 - (textStart - firstClip.startPosition);
    totalWidth -= (1 - startClipCoverage) * clipWidth;
  }
  
  // adjust for partial coverage at end
  if (textEnd < lastClip.startPosition + lastClip.duration) {
    const endClipCoverage = textEnd - lastClip.startPosition;
    totalWidth -= (1 - endClipCoverage) * clipWidth;
  }
  
  return Math.max(clipWidth, totalWidth);
}