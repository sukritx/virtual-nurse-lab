// surgical-3.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import LabRecordingComponent from './SurgicalRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab3Recording = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('th');
    const { token } = useAuth(); // Still need token for API calls for logged-in users
    const navigate = useNavigate();

    useEffect(() => {
        // Since this page is now behind a PrivateRoute, we know the user is logged in.
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/surgical/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab3 = response.data.labs.find(lab => lab.labInfo.labNumber === 3);
                if (lab3) {
                    setAttemptsLeft(lab3.attemptsLeft);
                }
            } catch (error) {
                console.error('Error fetching lab info:', error);
                // Optionally handle errors, e.g., by navigating away or showing an error message
                // If a 401/403 error occurs here, PrivateRoute should have already handled it,
                // but you might want specific error handling for API failures.
            }
        };
        fetchLabInfo();
    }, [token]); // token is the only dependency needed now

    const handleLanguageChange = (event) => {
        const newLanguage = event.target.value;
        setLanguage(newLanguage);
        
        if (newLanguage === 'zh') {
            navigate('/surgical/cn');
        } else if (newLanguage === 'en') {
            navigate('/surgical/en');
        } else if (newLanguage === 'jp') {
            navigate('/surgical/jp');
        } else if (newLanguage === 'id') {
            navigate('/surgical/id');
        }
    };

    const handleSignupClick = () => {
        navigate('/signup');
    };

    return (
        <LabRecordingComponent
            labNumber={3}
            title="สถานการณ์ที่3: การพยาบาลผู้ป่วยหลังผ่าตัด"
            subtitle="การสอนผู้ป่วยก่อนกลับบ้าน"
            description="
            ผู้ป่วยหญิงอายุ 65 ปี การศึกษา ม.3 การวินิจฉัยโรค Closed Fx. Rt. Intertrochanteric หลังผ่าตัด ORIF with PFNA Rt leg (Open Reduction and Internal Fixation with Proximal Femoral Nail Antirotation right leg) เมื่อวันที่ 1 ของเดือนนี้
            อาการปัจจุบัน: อาการทั่วไปดี มีแผลผ่าตัดบริเวณสะโพกขวาปิดก๊อซไว้ แห้งดี ปวดเล็กน้อยเวลาขยับ เดินได้ดีโดยใช้ Walker วันนี้ (หลังผ่าตัดวันที่ 4) แพทย์อนุญาตให้กลับบ้านได้ โดยมีแผนการรักษาก่อนกลับบ้านดังนี้ - D/C - ตัดไหมเมื่อครบ 2 สัปดาห์หลังผ่าตัด - F/U 1 เดือน (Film Rt. Leg ก่อนพบแพทย์) Home-medication - Naproxen (500 mg.) 1 x 2 pc # 10 - Paracetamol (500 mg) 1 x prn q 4-6 hr. # 20 - Caltrate 600 mg 1 x 1 OD pc # 30
            "
            questions={[
                "ขอให้ท่านเตรียมผู้ป่วยก่อนกลับบ้านแก่ผู้ป่วยรายนี้ โดยให้ครอบคลุมตามหลัก D-METHOD"
            ]}
            videoSrc="/surgical/surgical3.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab3Recording;