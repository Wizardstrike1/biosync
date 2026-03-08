interface StatusBarProps {
  completed: number;
  total: number;
}

const StatusBar = ({ completed, total }: StatusBarProps) => {
  const pct = Math.round((completed / total) * 100);

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs font-mono text-muted-foreground">CALIBRATION PROGRESS</span>
        <span className="text-xs font-mono text-primary">{pct}%</span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export default StatusBar;
