import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Play, Ear, Wind, ScanEye, Eye, Hand } from "lucide-react";
import { Button } from "@/components/ui/button";

const testMeta: Record<string, { title: string; icon: any; color: string; description: string; duration: string; instructions: string[] }> = {
  hearing: {
    title: "Hearing Age",
    icon: Ear,
    color: "bg-hearing/15 text-hearing",
    description: "This test plays frequencies at different ranges to estimate your hearing age and detect potential hearing loss.",
    duration: "~3 min",
    instructions: [
      "Put on headphones for best results",
      "Find a quiet environment",
      "Tap when you hear a tone",
      "The test will progressively increase frequency",
    ],
  },
  respiratory: {
    title: "Respiratory Health",
    icon: Wind,
    color: "bg-respiratory/15 text-respiratory",
    description: "Analyze your exhale patterns and lung capacity through recorded breathing exercises.",
    duration: "~2 min",
    instructions: [
      "Sit upright in a comfortable position",
      "Take a deep breath in",
      "Exhale steadily into the microphone",
      "Repeat 3 times for accuracy",
    ],
  },
  pupil: {
    title: "Pupil Response",
    icon: ScanEye,
    color: "bg-pupil/15 text-pupil",
    description: "Measures how your pupils respond to light changes, indicating autonomic nervous system health.",
    duration: "~1 min",
    instructions: [
      "Position your face in the camera frame",
      "Keep your eyes open and steady",
      "The screen will flash different brightness levels",
      "Stay still during the measurement",
    ],
  },
  "eye-tracking": {
    title: "Eye Tracking & Blink",
    icon: Eye,
    color: "bg-eye-tracking/15 text-eye-tracking",
    description: "Tracks your eye movements and blink patterns to assess neurological health indicators.",
    duration: "~2 min",
    instructions: [
      "Allow camera access",
      "Follow the moving dot on screen",
      "Try not to move your head",
      "Blink naturally throughout the test",
    ],
  },
  motor: {
    title: "Motor Control",
    icon: Hand,
    color: "bg-motor/15 text-motor",
    description: "Tests your reaction time, fine motor control, and hand-eye coordination through interactive challenges.",
    duration: "~3 min",
    instructions: [
      "Use your dominant hand",
      "Tap targets as quickly as possible",
      "Follow the patterns shown on screen",
      "Complete all challenges for full assessment",
    ],
  },
};

const testRouteMap: Record<string, string> = {
  hearing: "/test/hearing",
  respiratory: "/test/respiratory",
  pupil: "/test/pupil",
  "eye-tracking": "/test/pupil",
  motor: "/test/motor",
};

const TestDetail = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const test = testMeta[testId || ""];

  if (!test) {
    return (
      <div className="px-5 pt-14 text-center">
        <p className="text-muted-foreground">Test not found</p>
      </div>
    );
  }

  const Icon = test.icon;

  return (
    <div className="px-5 pt-14 pb-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className={`h-16 w-16 rounded-2xl ${test.color} flex items-center justify-center mb-4`}>
          <Icon className="h-8 w-8" />
        </div>

        <h1 className="text-2xl font-display font-bold text-foreground">{test.title}</h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{test.description}</p>
        <p className="text-xs text-primary mt-2 font-medium">Duration: {test.duration}</p>

        <div className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Instructions</h2>
          {test.instructions.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold text-secondary-foreground shrink-0">
                {i + 1}
              </span>
              <p className="text-sm text-foreground/80 pt-0.5">{step}</p>
            </div>
          ))}
        </div>

        <Button
          className="w-full h-14 mt-10 text-base font-semibold gap-2"
          size="lg"
          onClick={() => navigate(testRouteMap[testId || ""] ?? "/tests")}
        >
          <Play className="h-5 w-5" />
          Start Test
        </Button>
      </motion.div>
    </div>
  );
};

export default TestDetail;
