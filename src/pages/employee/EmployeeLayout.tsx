import { Outlet } from "react-router-dom";
import { useEmployeeSession } from "@/context/EmployeeSessionContext";
import { LoadingScreen } from "@/components/LoadingScreen";
import { WelcomePage } from "./WelcomePage";

export function EmployeeLayout() {
  const { status } = useEmployeeSession();

  if (status === "loading") return <LoadingScreen />;
  if (status === "anonymous") return <WelcomePage />;
  return <Outlet />;
}
