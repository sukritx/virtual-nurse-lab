import { useState } from "react";
import { BottomWarning } from "../components/BottomWarning";
import { Button } from "../components/Button";
import { Heading } from "../components/Heading";
import { InputBox } from "../components/InputBox";
import { SubHeading } from "../components/SubHeading";
import axios from '../api/axios';
import { jwtDecode } from 'jwt-decode'
import { useNavigate } from "react-router-dom";
import { useAuth } from '../context/AuthContext';

export const Signin = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSignin = async () => {
    try {
      const response = await axios.post('/api/v1/user/signin', {
        username,
        password
      });
      const { token, user } = response.data;
      login(token, user);

      // Decode the token to get user information
      const decodedToken = jwtDecode(token);

      // Redirect based on user role and university
      if (decodedToken.isAdmin) {
        navigate("/admin/dashboard");
      } else if (decodedToken.isProfessor && user.university === 'Subject315') {
        navigate("/professor/315/dashboard");
      } else if (decodedToken.isProfessor) {
        navigate("/professor/dashboard");
      } else if (user && user.university === 'Subject315') {
        navigate("/student/315/dashboard");
      } else if (user && user.university === 'Trial-CSSD') {
        navigate("/cssd");
      } else {
        navigate("/student/dashboard");
      }
    } catch (error) {
      console.error("Error during signin:", error);

      if (error.response) {
        // Server responded with a status other than 200 range
        alert(error.response.data.message || "Signin failed");
      } else if (error.request) {
        // Request was made but no response received
        alert("No response from server. Please try again later.");
      } else {
        // Something happened in setting up the request
        alert("Error during signin. Please try again.");
      }
    }
  };

  return (
    <div className="bg-slate-300 h-screen flex justify-center">
      <div className="flex flex-col justify-center">
        <div className="rounded-lg bg-white w-80 text-center p-2 h-max px-4">
          <Heading label={"Sign in"} />
          <SubHeading label={"ลงชื่อเข้าใช้งาน"} />
          <InputBox onChange={e => setUsername(e.target.value)} placeholder="username" label={"Username"} />
          <InputBox onChange={e => setPassword(e.target.value)} type="password" placeholder="********" label={"Password"} />
          <div className="pt-4">
            <Button onClick={handleSignin} label={"Sign in"} />
          </div>
          <BottomWarning label={"Don't have an account?"} buttonText={"Sign up"} to={"/signup"} />
        </div>
      </div>
    </div>
  );
};