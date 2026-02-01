# Video Editor Challenge - Implementation Documentation

## Project Overview

### What Was Built
A full-featured video editor web application that allows users to:
- Arrange and reorder video clips on a timeline
- Add animated text overlays that span multiple clips
- Drag and resize text to snap to clip boundaries
- Render the final video with all edits applied
- Track render progress in real-time

### Tech Stack
- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Express.js, Remotion (video rendering)
- **State Management**: tRPC
- **Animations**: Lottie, Framer Motion
- **Drag & Drop**: DnD Kit

---

## Architecture

### Monorepo Structure
```
.
├── apps/
│   ├── app/              # Next.js frontend
│   │   ├── components/   # UI components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── lib/          # Utility functions
│   │   └── data/         # Constants and sample data
│   └── render/           # Render server
│       ├── server/       # Express API
│       └── remotion/     # Video composition
```

### Data Flow
```
User Interaction → Frontend State → Render Request → Express Server
                                                            ↓
                                    Remotion Bundler → Composition
                                                            ↓
                                    Frame-by-frame Render → MP4 Output
                                                            ↓
                                    Progress Events ← SSE Stream ← Frontend
```

---

## Implementation Journey

### Level 1: Text & Render (Core Features)

#### Step 1: Understanding the Timeline System
**Problem**: Text needed to align with video clips in a timeline

**Key Concepts**:
- Timeline measured in "clip units" (position 0, 1, 2...)
- Each clip = 5 seconds by default
- Frame rate (FPS) = 30 frames/second
- Therefore: 1 clip = 150 frames (5 × 30)

**Formula**:
```typescript
textStartFrame = startPosition × FRAMES_PER_CLIP
textEndFrame = (startPosition + duration) × FRAMES_PER_CLIP
```

#### Step 2: Implementing Draggable Text Component

**File**: `components/draggable-text.tsx`

**Features Implemented**:
1. **Drag to reposition**: Move text horizontally across clips
2. **Resize handles**: Left and right handles to adjust duration
3. **Snap to boundaries**: Automatically aligns to clip edges
4. **Visual feedback**: Active state, hover effects, shadows

**Key State Variables**:
```typescript
interface DraggableTextProps {
  id: string;                    // Unique identifier
  textContent: string;           // Display text
  startPosition: number;         // Starting clip position (0, 1, 2...)
  duration: number;              // How many clips it spans
  isActive: boolean;             // Whether text is selected
  clipWidth: number;             // Width of each clip (px)
  gap: number;                   // Gap between clips (px)
  totalClips: number;            // Total clips in timeline
  onPositionChange: (id, pos, duration?) => void;
}
```

**Position Calculation**:
```typescript
// X position in pixels
const xPosition = startPosition × (clipWidth + gap);

// Width calculation spanning multiple clips
const calculatedWidth = clipWidth × duration + gap × (duration - 1) - 15;
```

#### Step 3: Snap-to-Clip Logic

**File**: `lib/timeline-utils.ts`

**Snapping Algorithm**:
```typescript
export function snapToClipBoundaries(
  position: number,
  clips: Clip[],
  snapThreshold: number = 0.3  // 30% of clip width
): number {
  // 1. Get all snap points (clip starts and ends)
  const snapPoints = getAllSnapPoints(clips);
  
  // 2. Find closest snap point
  const closest = snapPoints.reduce((prev, curr) =>
    Math.abs(curr - position) < Math.abs(prev - position) ? curr : prev
  );
  
  // 3. Only snap if within threshold
  return Math.abs(closest - position) <= snapThreshold 
    ? closest 
    : position;
}
```

**Why This Works**:
- Creates magnetic effect when dragging near clip edges
- Prevents accidental misalignment
- Threshold = 0.3 means snaps within 30% of clip width

#### Step 4: Remotion Video Composition

**File**: `apps/render/remotion/comp.tsx`

**Understanding Remotion's Frame System**:
- Remotion renders video **frame by frame**
- Each frame is a React component
- Total frames = duration (seconds) × FPS

**Text Overlay Component**:
```typescript
const TextOverlay: React.FC<{ 
  content: string; 
  animation?: any;
  sequenceDuration: number;
}> = ({ content, animation, sequenceDuration }) => {
  const frame = useCurrentFrame();  // Current frame number
  
  // Fade in/out animation
  const fadeInDuration = 10;
  const fadeOutStart = sequenceDuration - 10;
  
  const opacity = interpolate(
    frame,
    [0, fadeInDuration, fadeOutStart, sequenceDuration],
    [0, 1, 1, 0],  // Fade in → stay → fade out
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  return (
    <AbsoluteFill style={{ opacity }}>
      {animation ? (
        <Lottie animationData={animation} loop={true} />
      ) : (
        <div style={{ fontSize: 80, color: 'white' }}>
          {content}
        </div>
      )}
    </AbsoluteFill>
  );
};
```

**Composition Structure**:
```typescript
<AbsoluteFill>
  {/* Video clips in sequence */}
  {clips.map((clip, index) => (
    <Sequence from={startFrame} durationInFrames={clipFrames}>
      <OffthreadVideo src={clip.url} />
    </Sequence>
  ))}
  
  {/* Text overlay on top */}
  {textOverlay && (
    <Sequence from={textStartFrame} durationInFrames={textDuration}>
      <TextOverlay content={text} animation={animData} />
    </Sequence>
  )}
</AbsoluteFill>
```

#### Step 5: Render API Implementation

**File**: `apps/render/server/index.ts`

**Key Challenge**: How to track long-running render jobs?

**Solution**: Server-Sent Events (SSE) for real-time progress

**Flow**:
```
1. POST /api/render
   ↓
2. Generate renderId (UUID)
   ↓
3. Start async render job
   ↓
4. Return renderId immediately
   ↓
5. Client connects to GET /api/render-progress/:id (SSE)
   ↓
6. Server streams progress updates every 500ms
   ↓
7. When done, client downloads from GET /api/download/:id
```

**Implementation**:
```typescript
// Progress tracking
type RenderProgress = {
  progress: number;  // 0-100
  done: boolean;
  error?: string;
};

const renderProgress = new Map<string, RenderProgress>();

// Render endpoint
app.post("/api/render", async (req, res) => {
  const renderId = randomUUID();
  renderProgress.set(renderId, { progress: 0, done: false });
  
  res.json({ renderId });  // Return immediately
  
  try {
    await renderMedia({
      // ... config
      onProgress: ({ progress }) => {
        renderProgress.set(renderId, {
          progress: Math.round(progress * 100),
          done: false,
        });
      },
    });
    
    renderProgress.set(renderId, { progress: 100, done: true });
  } catch (err) {
    renderProgress.set(renderId, { 
      progress: 0, 
      done: true, 
      error: "Render failed" 
    });
  }
});

// SSE progress endpoint
app.get("/api/render-progress/:id", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  
  const interval = setInterval(() => {
    const data = renderProgress.get(id);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    
    if (data.done) {
      clearInterval(interval);
      res.end();
    }
  }, 500);
});
```

---

### Level 2: Reorder Clips

**Library Used**: DnD Kit (React drag-and-drop)

**File**: `apps/app/components/tch-video-editor.tsx`

**Implementation**:
```typescript
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensors,
  useSensor,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";

// Setup sensors
const sensors = useSensors(
  useSensor(PointerSensor, { 
    activationConstraint: { distance: 5 }  // Prevent accidental drags
  })
);

// Handle reorder
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;

  const oldIndex = activeClips.findIndex(c => c.id === active.id);
  const newIndex = activeClips.findIndex(c => c.id === over.id);

  // Reorder array
  const updatedClips = [...activeClips];
  const [movedClip] = updatedClips.splice(oldIndex, 1);
  updatedClips.splice(newIndex, 0, movedClip);

  setActiveClips(updatedClips);
};

// Wrap timeline
<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragEnd={handleDragEnd}
>
  <SortableContext
    items={activeClips.map(c => c.id)}
    strategy={horizontalListSortingStrategy}
  >
    {activeClips.map(clip => (
      <SortableClip key={clip.id} clip={clip} />
    ))}
  </SortableContext>
</DndContext>
```

**Text Position Handling**:
When clips reorder, text position remains in "clip units", so it automatically follows the new arrangement.

---

### Level 5: UX Improvements

#### 1. Render Progress UI

**File**: `components/render-button.tsx`

**Features**:
- Loading spinner during render
- Progress bar (0-100%)
- Success/error states
- Download button when complete

**Implementation**:
```typescript
const [renderState, setRenderState] = useState<{
  status: 'idle' | 'rendering' | 'success' | 'error';
  progress: number;
  downloadUrl?: string;
}>({ status: 'idle', progress: 0 });

const handleRender = async () => {
  setRenderState({ status: 'rendering', progress: 0 });
  
  // 1. Start render
  const { renderId } = await fetch('/api/render', { 
    method: 'POST', 
    body: JSON.stringify({ clips, textOverlay, ratio }) 
  }).then(r => r.json());
  
  // 2. Connect to SSE for progress
  const eventSource = new EventSource(
    `http://localhost:3001/api/render-progress/${renderId}`
  );
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    setRenderState({
      status: data.done ? 'success' : 'rendering',
      progress: data.progress,
      downloadUrl: data.done 
        ? `http://localhost:3001/api/download/${renderId}` 
        : undefined,
    });
    
    if (data.done) eventSource.close();
  };
};
```

#### 2. Visual Feedback

**Added**:
- Hover states on all interactive elements
- Active/inactive states for text overlay
- Drag shadows and scale effects
- Loading skeletons for async data
- Character count limits with visual indicator

---

## Key Features Implemented

### Timeline Management
- Dynamic clip arrangement
- Zoom in/out (0.33x - 2.22x)
- Responsive clip sizing
- Gap calculation between clips

### Text Overlay System
- Single text overlay spanning multiple clips
- Lottie animation support
- Character limits per animation
- Visual text dock for animation selection
- Real-time preview with debouncing

### Drag & Drop
- **Text**: Horizontal dragging with snap-to-clip
- **Clips**: Reorder with DnD Kit
- **Resize**: Text duration adjustment with handles
- Touch support for mobile

### Rendering Pipeline
- Remotion-based frame-by-frame rendering
- Server-side video composition
- Real-time progress tracking (SSE)
- Download management
- Error handling

### UX Enhancements
- Loading states throughout
- Progress indicators
- Success/error messages
- Responsive design
- Smooth animations (Framer Motion)

---

## Technical Deep Dive

### 1. Frame Calculation Logic

**Problem**: Convert "clip positions" to Remotion frames

```typescript
// Given:
const clip = {
  startPosition: 2,  // 3rd clip in timeline
  duration: 5        // 5 seconds
};
const fps = 30;

// Calculate:
let startFrame = 0;
for (let i = 0; i < clip.startPosition; i++) {
  startFrame += clips[i].duration * fps;
}
// startFrame = sum of all previous clip frames

const durationInFrames = clip.duration * fps;
// durationInFrames = 5 × 30 = 150 frames
```

**For Text Spanning Multiple Clips**:
```typescript
// Text covers clips 2-4 (3 clips total)
const textStartPosition = 2;
const textDuration = 3;  // number of clips

// Calculate start frame
let textStartFrame = 0;
for (let i = 0; i < textStartPosition; i++) {
  textStartFrame += clips[i].duration * fps;
}

// Calculate duration
let textDurationInFrames = 0;
for (let i = textStartPosition; i < textStartPosition + textDuration; i++) {
  textDurationInFrames += clips[i].duration * fps;
}
```

### 2. Lottie Animation Looping

**Problem**: Lottie animations had fixed duration, wouldn't loop to fill text duration

**Original Lottie Metadata**:
```json
{
  "fr": 24,   // Frame rate
  "ip": 0,    // In point (start)
  "op": 97    // Out point (end) - ONLY 97 FRAMES!
}
```

**Solution**: Set `loop={true}` on Lottie component
```typescript
<Lottie
  animationData={animation}
  loop={true}  // ← This makes it repeat!
  style={{ width, height }}
/>
```

### 3. SSE (Server-Sent Events) for Progress

**Why SSE instead of WebSockets?**
- Simpler: One-way communication (server → client)
- Built-in reconnection
- HTTP-based (easier with proxies/firewalls)

**Server Code**:
```typescript
app.get("/api/render-progress/:id", (req, res) => {
  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const interval = setInterval(() => {
    const data = renderProgress.get(id);
    
    // Send data in SSE format
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    
    if (data.done) {
      clearInterval(interval);
      res.end();
    }
  }, 500);  // Update every 500ms
});
```

**Client Code**:
```typescript
const eventSource = new EventSource(
  `http://localhost:3001/api/render-progress/${renderId}`
);

eventSource.onmessage = (event) => {
  const { progress, done } = JSON.parse(event.data);
  updateProgressBar(progress);
  
  if (done) {
    eventSource.close();
    showDownloadButton();
  }
};
```

### 4. Snap-to-Grid Algorithm

**Visual Explanation**:
```
Timeline: |Clip0|Gap|Clip1|Gap|Clip2|

Snap points: [0, 1, 2, 3]  (starts/ends of clips)

User drags text to position 0.8
                           ↓
Threshold = 0.3 (30% of clip width)
                           ↓
Distance to point 1 = |1 - 0.8| = 0.2 < 0.3 ✓ SNAP!
                           ↓
Text snaps to position 1
```

**Code**:
```typescript
export function snapToClipBoundaries(
  position: number,
  clips: Clip[],
  snapThreshold: number = 0.3
): number {
  // Get all snap points
  const snapPoints = [0, 1, 2, 3, ...];
  
  // Find nearest
  const closest = snapPoints.reduce((prev, curr) =>
    Math.abs(curr - position) < Math.abs(prev - position) 
      ? curr 
      : prev
  );
  
  // Apply threshold
  const distance = Math.abs(closest - position);
  return distance <= snapThreshold ? closest : position;
}
```

---

## Code Structure

### Frontend Components

#### `tch-video-editor.tsx` (Main Editor)
**Responsibilities**:
- Timeline state management
- Clip reordering
- Text overlay state
- Zoom level
- Render button integration

**Key State**:
```typescript
const [activeClips, setActiveClips] = useState([...]);
const [textInput, setTextInput] = useState("");
const [appliedText, setAppliedText] = useState("");
const [textStartPosition, setTextStartPosition] = useState(0);
const [textClipCount, setTextClipCount] = useState(1);
const [zoomLevel, setZoomLevel] = useState(1.0);
```

#### `draggable-text.tsx`
**Responsibilities**:
- Text dragging logic
- Resize handle interaction
- Snap calculations
- Visual feedback

#### `text-dock.tsx`
**Responsibilities**:
- Animation template selection
- Text input with character limits
- Lottie preview
- Apply/Reset actions

#### `render-button.tsx`
**Responsibilities**:
- Trigger render API
- Track progress via SSE
- Display status/errors
- Download link management

### Backend Structure

#### `server/index.ts`
**Endpoints**:
```
POST   /api/render              - Start render job
GET    /api/render-progress/:id - SSE progress stream
GET    /api/download/:id        - Download rendered video
GET    /health                  - Health check
```

#### `remotion/comp.tsx`
**Exports**:
- `VideoEditorComposition` - Main composition component
- `TextOverlay` - Text overlay with animations
- `RemotionRoot` - Entry point for Remotion

---

## How to Use

### 1. Setup
```bash
# Install dependencies
pnpm install

# Copy environment files
cp apps/app/.env.example apps/app/.env
cp apps/render/.env.example apps/render/.env

# Start both servers
pnpm run dev
```

### 2. Edit Video
1. **Add Text**:
   - Click "+" button or text overlay icon
   - Type text in input
   - Select animation style
   - Click "Apply Changes"

2. **Position Text**:
   - Click and drag text horizontally
   - Text will snap to clip boundaries
   - Use resize handles to span multiple clips

3. **Reorder Clips**:
   - Drag any clip left/right
   - Other clips will shift automatically
   - Text follows its clip positions

5. **Zoom Timeline**:
   - Use magnifier controls (top right)
   - Pinch-to-zoom on mobile

### 3. Render Video
1. Click "Render" button
2. Wait for progress (shown in modal)
3. Download when complete

---

## Challenges & Solutions

### Challenge 1: Text Not Spanning Multiple Clips
**Problem**: Text only appeared on first clip, not across all spanned clips

**Cause**: Remotion Sequence duration was wrong

**Solution**: Calculate duration by summing all spanned clips:
```typescript
let textDurationInFrames = 0;
for (let i = startClip; i < endClip; i++) {
  textDurationInFrames += clips[i].duration * fps;
}
```

### Challenge 2: Lottie Animation Not Looping
**Problem**: Animation played once then stopped, leaving empty space

**Cause**: Lottie `op` (out point) was set to 97 frames, animation didn't repeat

**Solution**: Set `loop={true}` on Lottie component
```typescript
<Lottie animationData={animation} loop={true} />
```

### Challenge 3: Render Progress Not Updating
**Problem**: Client couldn't track render progress

**Solution**: Implemented SSE (Server-Sent Events):
- Server stores progress in Map
- Client connects to SSE endpoint
- Server streams updates every 500ms
- Client updates UI in real-time

### Challenge 4: Text Position Lost on Clip Reorder
**Problem**: When clips reordered, text position became invalid

**Solution**: Store text position in "clip units", not pixel positions. Text automatically follows reordered clips since it references clip indices, not absolute positions.

### Challenge 5: Drag Conflicts Between Text and Clips
**Problem**: DnD Kit and custom text dragging interfered

**Solution**: 
- Set `activationConstraint: { distance: 5 }` on DnD sensors
- Stop propagation in text drag handlers
- Use different cursor styles


---

## Conclusion

This implementation covers:
- Level 1: Text snapping, dragging, and rendering
- Level 2: Clip reordering with DnD
- Level 5: UX improvements (progress, loading, errors)
