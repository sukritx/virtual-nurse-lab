import { useState } from "react";
import { BottomWarning } from "../components/BottomWarning";
import { Button } from "../components/Button";
import { Heading } from "../components/Heading";
import { InputBox } from "../components/InputBox";
import { SubHeading } from "../components/SubHeading";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useAuth } from '../context/AuthContext';

export const Signup = () => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [studentId, setStudentId] = useState("");
  const [registerCode, setRegisterCode] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();
  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState("");

  const validateInput = (name, value) => {
    let errorMessage = '';

    switch (name) {
      case 'username':
        if (!/^[a-z0-9]+$/.test(value)) {
          errorMessage = "Username must contain only lowercase letters and numbers";
        }
        break;
      case 'firstName':
      case 'lastName':
        if (!/^[a-zA-Z]+$/.test(value)) {
          errorMessage = `${name} must contain only letters`;
        }
        break;
      case 'password':
        if (value.length < 6) {
          errorMessage = "Password must be at least 6 characters long";
        }
        break;
      case 'studentId':
        if (!/^[0-9]+$/.test(value)) {
          errorMessage = "Student ID must contain only numbers";
        }
        break;
      case 'registerCode':
        if (value.length === 0) {
          errorMessage = "Register code cannot be empty";
        }
        break;
    }

    return errorMessage;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let processedValue = value;
    
    if (name === 'username') {
      processedValue = value.toLowerCase();
    } else if (name === 'firstName' || name === 'lastName') {
      processedValue = value.replace(/[^a-zA-Z]/g, '');
    } else if (name === 'studentId') {
      processedValue = value.replace(/[^0-9]/g, '');
    }

    switch (name) {
      case 'firstName':
        setFirstName(processedValue);
        break;
      case 'lastName':
        setLastName(processedValue);
        break;
      case 'username':
        setUsername(processedValue);
        break;
      case 'password':
        setPassword(value); // Keep original input for password
        break;
      case 'studentId':
        setStudentId(processedValue);
        break;
      case 'registerCode':
        setRegisterCode(value); // Keep original input for register code
        break;
    }
    validateInput(name, processedValue);
  };

  const handleSignup = async () => {
    // Clear previous errors
    setErrors({});
    setGeneralError("");

    // Validate all fields
    const fieldsToValidate = ['username', 'firstName', 'lastName', 'password', 'studentId', 'registerCode'];
    let newErrors = {};
    
    fieldsToValidate.forEach(field => {
      const errorMessage = validateInput(field, eval(field));
      if (errorMessage) {
        newErrors[field] = errorMessage;
      }
    });

    // Set all errors at once
    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      setGeneralError("Please fix the highlighted errors before submitting.");
      return;
    }

    try {
      const response = await axios.post("/api/v1/user/signup", {
        username,
        firstName,
        lastName,
        password,
        studentId,
        registerCode
      });
      const { token, user } = response.data;
      login(token, user);
      navigate("/student/dashboard");
    } catch (error) {
      console.error("Error during signup:", error);
      if (error.response?.data?.errors) {
        const serverErrors = error.response.data.errors;
        const newErrors = {};
        serverErrors.forEach(err => {
          newErrors[err.field] = err.message;
        });
        setErrors(prevErrors => ({ ...prevErrors, ...newErrors }));
        setGeneralError("Please correct the errors and try again.");
      } else if (error.response?.data?.message) {
        setGeneralError(error.response.data.message);
      } else {
        setGeneralError("An unexpected error occurred. Please try again.");
      }
    }
  };

  return (
    <div className="bg-slate-300 h-screen flex justify-center">
      <div className="flex flex-col justify-center">
        <div className="rounded-lg bg-white w-80 text-center p-2 h-max px-4">
          <Heading label={"Sign up"} />
          <SubHeading label={"ใส่ข้อมูลของตนเองเพื่อลงทะเบียน"} />
          {generalError && <div className="text-red-500 mb-2">{generalError}</div>}
          <InputBox onChange={handleInputChange} name="firstName" placeholder="supassara" label={"First Name*"} error={errors.firstName} />
          <InputBox onChange={handleInputChange} name="lastName" placeholder="jaidee" label={"Last Name*"} error={errors.lastName} />
          <InputBox onChange={handleInputChange} name="username" placeholder="username" label={"Username*"} error={errors.username} />
          <InputBox onChange={handleInputChange} name="password" type="password" placeholder="password123" label={"Password*"} error={errors.password} />
          <InputBox onChange={handleInputChange} name="studentId" placeholder="12345678" label={"Student ID*"} error={errors.studentId} />
          <InputBox onChange={handleInputChange} name="registerCode" placeholder="registercode123" label={"Register Code*"} error={errors.registerCode} />
          <div className="pt-4">
            <Button onClick={handleSignup} label={"Sign up"} />
          </div>
          <BottomWarning label={"Already have an account?"} buttonText={"Sign in"} to={"/signin"} />
        </div>
      </div>
    </div>
  );
};