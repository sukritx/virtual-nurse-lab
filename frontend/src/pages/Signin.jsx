// Signin Component
import { useState } from "react";
import { BottomWarning } from "../components/BottomWarning";
import { Button } from "../components/Button";
import { Heading } from "../components/Heading";
import { InputBox } from "../components/InputBox";
import { SubHeading } from "../components/SubHeading";
import axios from "../api/axios";
import { jwtDecode } from "jwt-decode";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export const Signin = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();
  const [generalError, setGeneralError] = useState("");

  const handleSignin = async () => {
    setGeneralError(""); // Clear previous errors
    try {
      const response = await axios.post("/api/v1/user/signin", {
        username,
        password,
      });
      const { token, user } = response.data; // Expects user object with roles and registerCode
      login(token, user);

      // Decode the token to get user information (additional checks for safety/completeness)
      const decodedToken = jwtDecode(token);

      // --- Centralized Redirection Logic ---

      // 1. Admin redirection (Highest Priority)
      if (decodedToken.isAdmin) {
        navigate("/admin/dashboard");
        return;
      }

      // 2. Professor Redirection
      // This block will handle all professor-specific redirections.
      if (decodedToken.isProfessor) {
        // Try specific registerCode redirects first for professors
        if (user && user.universityCode) {
          const upperRegisterCode = user.universityCode.toUpperCase();
          if (upperRegisterCode.startsWith("SUR")) {
            navigate("/professor/surgical/dashboard");
            return;
          }
          if (upperRegisterCode.startsWith("MED")) {
            navigate("/professor/medical/dashboard");
            return;
          }
          if (upperRegisterCode.startsWith("OB")) {
            navigate("/professor/ob/dashboard");
            return;
          }
        }

        // Fallback for professors with 'Subject315' university, if no registerCode prefix matched
        if (user && user.university === "Subject315") {
          navigate("/professor/315/dashboard");
          return;
        }

        // Default professor dashboard if no other specific professor route matches
        navigate("/professor/dashboard");
        return; // Ensure to exit after professor redirection
      }

      // 3. Student Redirection (only reached if not Admin or Professor)
      // Try specific registerCode redirects for students
      if (user && user.universityCode) {
        const upperRegisterCode = user.universityCode.toUpperCase();
        if (upperRegisterCode.startsWith("SUR")) {
          navigate("/surgical/dashboard");
          return;
        }
        if (upperRegisterCode.startsWith("MED")) {
          navigate("/medical/dashboard");
          return;
        }
        if (upperRegisterCode.startsWith("OB")) {
          navigate("/ob/dashboard");
          return;
        }
      }

      // 4. Fallback for students based on university (if no specific registerCode matched)
      if (user && user.university === "Subject315") {
        navigate("/student/315/dashboard");
        return;
      }
      if (user && user.university === "Trial-CSSD") {
        navigate("/cssd");
        return;
      }

      // 5. Default student dashboard (if none of the above conditions were met)
      navigate("/student/dashboard");

    } catch (error) {
      console.error("Error during signin:", error);

      if (error.response) {
        // Server responded with a status other than 200 range
        setGeneralError(error.response.data.message || "Signin failed");
      } else if (error.request) {
        // Request was made but no response received
        setGeneralError("No response from server. Please try again later.");
      } else {
        // Something happened in setting up the request
        setGeneralError("Error during signin. Please try again.");
      }
    }
  };

  return (
    <div className="bg-slate-300 h-screen flex justify-center">
      <div className="flex flex-col justify-center">
        <div className="rounded-lg bg-white w-80 text-center p-2 h-max px-4">
          <Heading label={"Sign in"} />
          <SubHeading label={"ลงชื่อเข้าใช้งาน"} />
          {generalError && (
            <div className="text-red-500 mb-4">{generalError}</div>
          )}
          <InputBox
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            label={"Username"}
          />
          <InputBox
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="********"
            label={"Password"}
          />
          <div className="pt-4">
            <Button onClick={handleSignin} label={"Sign in"} />
          </div>
          <BottomWarning
            label={"Don't have an account?"}
            buttonText={"Sign up"}
            to={"/signup"}
          />
        </div>
      </div>
    </div>
  );
};