import { motion } from "framer-motion";
import { Ear, Wind, Eye, Hand } from "lucide-react";
import TestCard from "@/components/TestCard";

const tests = [
  { title: "Hearing Age", description: "Frequency response & hearing age estimation", icon: <Ear className="h-5 w-5 text-hearing" />, route: "/test/hearing" },
  { title: "Respiratory Health", description: "Exhale analysis & lung capacity", icon: <Wind className="h-5 w-5 text-respiratory" />, route: "/test/respiratory" },
  { title: "Eye Tracking & Blink", description: "Saccade accuracy & blink patterns", icon: <Eye className="h-5 w-5 text-eye-tracking" />, route: "/test/pupil" },
  { title: "Motor Control", description: "Reaction time & fine motor skills", icon: <Hand className="h-5 w-5 text-motor" />, route: "/test/motor" },
];

const Tests = () => {
  return (
    <div className="px-5 pt-14 pb-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-display font-bold text-foreground mb-2">All Tests</h1>
        <p className="text-sm text-muted-foreground mb-6">Select a test to begin your assessment</p>
      </motion.div>
      <div className="space-y-3">
        {tests.map((test) => (
          <TestCard
            key={test.title}
            title={test.title}
            description={test.description}
            icon={test.icon}
            route={test.route}
            status="ready"
          />
        ))}
      </div>
    </div>
  );
};

export default Tests;
