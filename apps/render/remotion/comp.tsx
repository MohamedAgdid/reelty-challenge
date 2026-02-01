import React from "react";
import { AbsoluteFill, Composition, Sequence, useCurrentFrame, useVideoConfig, OffthreadVideo, interpolate } from "remotion";
import { Lottie } from '@remotion/lottie';

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
    startPosition: number;
    duration: number; 
    animation?: any | null;
  } | null;
}

const TextOverlay: React.FC<{ 
  content: string; 
  animation?: any | null;
  sequenceDuration: number;
}> = ({ content, animation = null, sequenceDuration }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  
  // fade in/out animation using the sequence duration
  const fadeInDuration = 10;
  const fadeOutStart = Math.max(fadeInDuration + 1, sequenceDuration - 10);
  
  const opacity = interpolate(
    frame,
    [0, fadeInDuration, fadeOutStart, sequenceDuration],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );


  // Debugging logs for animation object at key frames
  // if (animation && (frame === 0 || frame === 150 || frame === 299)) {
  //   console.log(`Frame ${frame} - Animation object:`, {
  //     hasAnimation: !!animation,
  //     animationKeys: animation ? Object.keys(animation) : [],
  //     fr: animation?.fr, // frame rate
  //     ip: animation?.ip, // in point
  //     op: animation?.op, // out point (duration in frames)
  //     opacity
  //   });
  // }


  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', zIndex: 10 }}>
      {animation ? (
        <Lottie
          animationData={animation}
          loop={true}  // make it loop
          style={{ opacity, width: width, height: height }} 
        />
      ) : (
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
      )}
    </AbsoluteFill>
  );
};

const VideoEditorComposition: React.FC<VideoEditorProps> = ({ clips, textOverlay }) => {
  const { fps } = useVideoConfig();

  
  console.log('=== VIDEO EDITOR COMPOSITION ===');
  console.log('Number of clips:', clips.length);
  clips.forEach((clip, i) => {
    console.log(`Clip ${i}:`, {
      id: clip.id,
      duration: clip.duration,
      url: clip.url.substring(0, 50)
    });
  });
  
  if (textOverlay) {
    console.log('Text overlay:', {
      content: textOverlay.content,
      startPosition: textOverlay.startPosition,
      duration: textOverlay.duration,
      animation: textOverlay.animation ? 'YES' : 'NO'
    });
  }
  console.log('FPS:', fps);
  console.log('================================');


  
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
          const numberOfClipsToSpan = textOverlay.duration; // count of clips to span
          const endClipIndex = startClipIndex + numberOfClipsToSpan; // end position
          
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
                sequenceDuration={textDurationInFrames}
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