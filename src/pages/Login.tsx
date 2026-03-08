import { Navigate } from "react-router-dom";

const Login = () => {
  return <Navigate to="/auth?mode=login" replace />;
};

export default Login;
