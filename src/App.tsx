import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { EmployeeSessionProvider } from "@/context/EmployeeSessionContext";
import { AdminSessionProvider } from "@/context/AdminSessionContext";
import { EmployeeLayout } from "@/pages/employee/EmployeeLayout";
import { HomePage } from "@/pages/employee/HomePage";
import { DayDetailPage } from "@/pages/employee/DayDetailPage";
import { AdminLayout } from "@/pages/admin/AdminLayout";
import { AdminDashboardPage } from "@/pages/admin/DashboardPage";
import { AdminEmployeesPage } from "@/pages/admin/EmployeesPage";
import { AdminDayPage } from "@/pages/admin/AdminDayPage";

export function App() {
  return (
    <BrowserRouter basename="/g">
      <Routes>
        <Route
          path="/"
          element={
            <EmployeeSessionProvider>
              <EmployeeLayout />
            </EmployeeSessionProvider>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="day/:dow" element={<DayDetailPage />} />
        </Route>

        <Route
          path="/admin"
          element={
            <AdminSessionProvider>
              <AdminLayout />
            </AdminSessionProvider>
          }
        >
          <Route index element={<AdminDashboardPage />} />
          <Route path="employees" element={<AdminEmployeesPage />} />
          <Route path="day/:dow" element={<AdminDayPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
