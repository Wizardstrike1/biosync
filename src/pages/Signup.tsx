import { Navigate } from "react-router-dom";

const Signup = () => {
  return <Navigate to="/auth?mode=signup" replace />;
};

export default Signup;
