import { useState, useEffect } from "react";
import { BottomWarning } from "../components/BottomWarning";
import { Button } from "../components/Button";
import { Heading } from "../components/Heading";
import { InputBox } from "../components/InputBox";
import { SubHeading } from "../components/SubHeading";
import axios from "../api/axios";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
// jwtDecode is not used in Signup, so it can be removed or kept if planning future use
// import { jwtDecode } from "jwt-decode";

// Helper function for redirection logic
const redirectUser = (navigate, user, registerCode) => {
  if (user) {
    // 1. Admin redirection (highest priority)
    // Note: This check assumes `user.isAdmin` is available in the `user` object returned from signup.
    // If your signup doesn't set isAdmin, this block won't be active until that's implemented.
    if (user.isAdmin) {
      navigate("/admin/dashboard");
      return;
    }

    // 2. Professor redirection based on registerCode
    // Note: This check assumes `user.isProfessor` is available in the `user` object returned from signup.
    // If your signup doesn't set isProfessor, this block won't be active until that's implemented.
    if (user.isProfessor && registerCode) {
      const upperRegisterCode = registerCode.toUpperCase();
      if (upperRegisterCode.startsWith("SUR")) {
        navigate("/professor/surgical/dashboard"); // Professor Surgical Dashboard
        return;
      }
      if (upperRegisterCode.startsWith("MED")) {
        navigate("/professor/medical/dashboard"); // Professor Medical Dashboard
        return;
      }
      if (upperRegisterCode.startsWith("OB")) {
        navigate("/professor/ob/dashboard"); // Professor OB Dashboard
        return;
      }
      // Fallback for professors without a specific registerCode prefix (e.g., Subject315)
      if (user.university === "Subject315") {
        navigate("/professor/315/dashboard");
        return;
      }
      // Default professor dashboard if no specific match
      navigate("/professor/dashboard");
      return;
    }

    // 3. Student redirection based on registerCode (if not admin/professor)
    if (registerCode) {
      const upperRegisterCode = registerCode.toUpperCase();
      if (upperUpperRegisterCode.startsWith("SUR")) {
        navigate("/surgical/dashboard"); // Student Surgical Dashboard
        return;
      }
      if (upperRegisterCode.startsWith("MED")) {
        navigate("/medical/dashboard"); // Student Medical Dashboard
        return;
      }
      if (upperRegisterCode.startsWith("OB")) {
        navigate("/ob/dashboard"); // Student OB Dashboard
        return;
      }
    }

    // 4. Existing university-based redirections for students (if registerCode didn't match specific type)
    if (user.university === "Subject315") {
      navigate("/student/315/dashboard");
      return;
    }
    if (user.university === "Trial-CSSD") {
      navigate("/cssd");
      return;
    }

    // 5. Default student dashboard
    navigate("/student/dashboard");
    return;
  }
};

export const Signup = () => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [studentId, setStudentId] = useState("");
  // Reverted to registerCode
  const [registerCode, setRegisterCode] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();
  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const validateInput = (name, value) => {
    let errorMessage = "";

    switch (name) {
      case "username":
        if (!/^[a-z0-9_]+$/.test(value)) {
          errorMessage =
            "Username must contain only lowercase letters, numbers, and underscores";
        }
        break;
      case "firstName":
      case "lastName":
        if (!/^[a-zA-Z]+$/.test(value)) {
          errorMessage = `${
            name === "firstName" ? "First" : "Last"
          } name must contain only letters`;
        }
        break;
      case "password":
        if (value.length < 6) {
          errorMessage = "Password must be at least 6 characters long";
        }
        break;
      case "studentId":
        if (!/^[0-9]+$/.test(value)) {
          errorMessage = "Student ID must contain only numbers";
        }
        break;
      // registerCode validation (alphanumeric 6 chars)
      case "registerCode":
        if (!/^[a-zA-Z0-9]{6}$/.test(value)) {
          errorMessage = "Register code must be 6 alphanumeric characters";
        }
        break;
    }

    return errorMessage;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let processedValue = value;

    if (name === "username") {
      processedValue = value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    } else if (name === "firstName" || name === "lastName") {
      processedValue = value.replace(/[^a-zA-Z]/g, "");
    } else if (name === "studentId") {
      processedValue = value.replace(/[^0-9]/g, "");
    } else if (name === "registerCode") {
      processedValue = value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6);
    }

    switch (name) {
      case "firstName":
        setFirstName(processedValue);
        break;
      case "lastName":
        setLastName(processedValue);
        break;
      case "username":
        setUsername(processedValue);
        break;
      case "password":
        setPassword(value); // Keep original input for password
        break;
      case "studentId":
        setStudentId(processedValue);
        break;
      case "registerCode":
        setRegisterCode(processedValue);
        break;
    }

    const errorMessage = validateInput(name, processedValue);
    setErrors((prev) => ({ ...prev, [name]: errorMessage }));
  };

  const handleSignup = async () => {
    // Clear previous errors
    setErrors({});
    setGeneralError("");

    // Validate all fields
    const fieldsToValidate = [
      "username",
      "firstName",
      "lastName",
      "password",
      "studentId",
      "registerCode",
    ];
    let newErrors = {};

    fieldsToValidate.forEach((field) => {
      const valueToValidate = {
        username,
        firstName,
        lastName,
        password,
        studentId,
        registerCode,
      }[field];
      const errorMessage = validateInput(field, valueToValidate);
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

    setIsLoading(true);
    try {
      const response = await axios.post("/api/v1/user/signup", {
        username,
        firstName,
        lastName,
        password,
        studentId,
        registerCode,
      });
      const { token, user } = response.data;
      login(token, user);

      // Call the new redirection helper function
      // user.isProfessor and user.isAdmin should be part of the 'user' object returned from signup API.
      // If not, this logic will default to student paths.
      redirectUser(navigate, user, registerCode);
    } catch (error) {
      console.error("Error during signup:", error);
      if (error.response?.data?.errors) {
        const serverErrors = error.response.data.errors;
        const newErrors = {};
        serverErrors.forEach((err) => {
          newErrors[err.field] = err.message;
        });
        setErrors((prevErrors) => ({ ...prevErrors, ...newErrors }));
        setGeneralError("Please correct the errors and try again.");
      } else if (error.response?.data?.message) {
        setGeneralError(error.response.data.message);
      } else {
        setGeneralError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Debug: Log errors whenever they change
  useEffect(() => {
    console.log("Current errors:", errors);
  }, [errors]);

  return (
    <div className="bg-slate-300 min-h-screen flex justify-center items-center py-8">
      <div className="w-full max-w-md">
        <div className="rounded-lg bg-white text-center p-6 shadow-md">
          <Heading label={"Sign up"} />
          <SubHeading label={"ใส่ข้อมูลของตนเองเพื่อลงทะเบียน"} />
          {generalError && (
            <div className="text-red-500 mb-4">{generalError}</div>
          )}
          <InputBox
            onChange={handleInputChange}
            name="firstName"
            value={firstName}
            placeholder="Supassara"
            label={"First Name*"}
            error={errors.firstName}
          />
          <InputBox
            onChange={handleInputChange}
            name="lastName"
            value={lastName}
            placeholder="Jaidee"
            label={"Last Name*"}
            error={errors.lastName}
          />
          <InputBox
            onChange={handleInputChange}
            name="username"
            value={username}
            placeholder="my_username"
            label={"Username*"}
            error={errors.username}
          />
          <InputBox
            onChange={handleInputChange}
            name="password"
            value={password}
            type="password"
            placeholder="password123"
            label={"Password*"}
            error={errors.password}
          />
          <InputBox
            onChange={handleInputChange}
            name="studentId"
            value={studentId}
            placeholder="12345678"
            label={"Student ID*"}
            error={errors.studentId}
          />
          <InputBox
            onChange={handleInputChange}
            name="registerCode" // Stays as registerCode
            value={registerCode} // Stays as registerCode state
            placeholder="ABC123"
            label={"Register Code*"} // Label stays Register Code
            error={errors.registerCode} // Error key stays registerCode
          />
          <div className="pt-4">
            <Button onClick={handleSignup} label={"Sign up"} disabled={isLoading} />
          </div>
          <BottomWarning
            label={"Already have an account?"}
            buttonText={"Sign in"}
            to={"/signin"}
          />
        </div>
      </div>
    </div>
  );
};