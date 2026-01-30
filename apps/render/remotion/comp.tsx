import { AbsoluteFill, Composition } from "remotion";

const RootComposition: React.FC = () => {
  return <AbsoluteFill />;
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="VideoEditor"
      component={RootComposition}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{}}
    />
  );
};