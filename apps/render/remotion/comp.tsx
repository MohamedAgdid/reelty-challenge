import React from "react";
import { AbsoluteFill, Composition, Sequence, useCurrentFrame, useVideoConfig, OffthreadVideo, interpolate } from "remotion";

// props for composition
export interface VideoEditorProps {
  clips: Array<{
    id: string;
    url: string;
    duration: number;
  }>;
  textOverlay?: {
    id: string;
    content: string;
    startPosition: number; //clip to start at
    duration: number; // how many clips to span
    animation?: string | null;
  } | null;
}

const TextOverlay: React.FC<{ content: string; animation?: string | null }> = ({ content }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { fps } = useVideoConfig();
  
  // fade in/out animation
  const fadeInDuration = 10;
  const fadeOutStart = durationInFrames - 10; // start fading out at 10 frames before end
  
  const opacity = interpolate(
    frame,
    [0, fadeInDuration, fadeOutStart, fadeOutStart + fadeInDuration],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10,
    }}>
      <div
        style={{
          fontSize: 80,
          fontWeight: 'bold',
          color: 'white',
          textAlign: 'center',
          padding: '0 40px',
          textShadow: '0 4px 8px rgba(0,0,0,0.5)',
          opacity,
        }}
      >
        {content}
      </div>
    </AbsoluteFill>
  );
};

const VideoEditorComposition: React.FC<VideoEditorProps> = ({ clips, textOverlay }) => {
  const { fps } = useVideoConfig();
  
  // calculate frame positions for each clip
  let currentFrame = 0;
  
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {/* render video clips in sequence */}
      {clips.map((clip, index) => {
        const durationInFrames = Math.round(clip.duration * fps);
        const startFrame = currentFrame;
        currentFrame += durationInFrames;
        
        return (
          <Sequence
            key={clip.id}
            from={startFrame}
            durationInFrames={durationInFrames}
          >
            <AbsoluteFill>
              <OffthreadVideo
                src={clip.url}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </AbsoluteFill>
          </Sequence>
        );
      })}
      
      {/* render text overlay if present */}
      {textOverlay && textOverlay.content && (
        (() => {
          // calculate which clips the text overlay spans
          const startClipIndex = textOverlay.startPosition;
          const endClipIndex = startClipIndex + textOverlay.duration;
          
          // calculate the frame range
          let textStartFrame = 0;
          for (let i = 0; i < startClipIndex; i++) {
            textStartFrame += Math.round(clips[i].duration * fps);
          }
          
          let textDurationInFrames = 0;
          for (let i = startClipIndex; i < Math.min(endClipIndex, clips.length); i++) {
            textDurationInFrames += Math.round(clips[i].duration * fps);
          }
          
          return (
            <Sequence
              from={textStartFrame}
              durationInFrames={textDurationInFrames}
            >
              <TextOverlay 
                content={textOverlay.content} 
                animation={textOverlay.animation}
              />
            </Sequence>
          );
        })()
      )}
    </AbsoluteFill>
  );
};
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="VideoEditor"
      component={VideoEditorComposition as unknown as React.ComponentType<Record<string, unknown>>}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        clips: [],
        textOverlay: null,
      }}
    />
  );
};