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
  const [generalError, setGeneralError] = useState(""); // Add for general errors

  const handleSignin = async () => {
    setGeneralError(""); // Clear previous errors
    try {
      const response = await axios.post("/api/v1/user/signin", {
        username,
        password,
      });
      const { token, user } = response.data; // Ensure 'user' object contains 'registerCode'
      login(token, user);

      // Decode the token to get user information (roles)
      const decodedToken = jwtDecode(token);

      // --- Redirection Logic ---

      // 1. Role-based redirections (as existing)
      if (decodedToken.isAdmin) {
        navigate("/admin/dashboard");
        return;
      }
      if (decodedToken.isProfessor && user.university === "Subject315") {
        navigate("/professor/315/dashboard");
        return;
      }
      if (decodedToken.isProfessor) {
        navigate("/professor/dashboard");
        return;
      }

      // 2. Register Code based redirection (assuming user object from backend contains registerCode)
      if (user && user.registerCode) {
        const upperRegisterCode = user.registerCode.toUpperCase();
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

      // 3. Existing university-based redirections for students (if registerCode didn't match)
      if (user && user.university === "Subject315") {
        navigate("/student/315/dashboard");
        return;
      }
      if (user && user.university === "Trial-CSSD") {
        navigate("/cssd");
        return;
      }

      // 4. Default student dashboard
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