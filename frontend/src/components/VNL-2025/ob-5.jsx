// ob-5.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import LabRecordingComponent from './OBRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab5Recording = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('th');
    const { token } = useAuth(); // Still need token for API calls for logged-in users
    const navigate = useNavigate();

    useEffect(() => {
        // Since this page is now behind a PrivateRoute, we know the user is logged in.
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/ob/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab5 = response.data.labs.find(lab => lab.labInfo.labNumber === 5);
                if (lab5) {
                    setAttemptsLeft(lab5.attemptsLeft);
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
            navigate('/ob/cn');
        } else if (newLanguage === 'en') {
            navigate('/ob/en');
        } else if (newLanguage === 'jp') {
            navigate('/ob/jp');
        } else if (newLanguage === 'id') {
            navigate('/ob/id');
        }
    };

    const handleSignupClick = () => {
        navigate('/signup');
    };

    return (
        <LabRecordingComponent
            labNumber={5}
            title="สถานการณ์ที่5: การเตรียมมารดาหลังคลอดก่อนกลับบ้าน"
            subtitle=""
            description="
            ข้อมูลผู้ป่วย: คุณสุนิสา มีสุข 30 ปี G1P1001 ปัจจุบัน หลังคลอดวันที่ 3 คลอดปกติ ทารกเพศหญิง น้ำหนัก 3350 กรัม แข็งแรงดี
            ข้อมูลด้านสุขภาพ น้ำหนักก่อนตั้งครรภ์ 65 กิโลกรัม ส่วนสูง 160 เซนติเมตร (BMI 25.4 kg/m²) ขณะตั้งครรภ์ได้รับการวินิจฉัยว่าเป็นเบาหวานขณะตั้งครรภ์ (GDM) ในไตรมาสที่สอง สามารถควบคุมระดับน้ำตาลได้ด้วยการควบคุมอาหาร น้ำหนักก่อนคลอด 83 กิโลกรัม (น้ำหนักขึ้นระหว่างตั้งครรภ์ 18 กิโลกรัม)
            ข้อมูลเพิ่มเติม:
            สัญญาณชีพ: ปกติ (T=37.2°C, P=82/min, R=18/min, BP=115/75 mmHg)
            การตรวจร่างกาย: ยอดมดลูกคลำได้ 3 นิ้วมือใต้ระดับสะดือ, น้ำคาวปลาสีแดงสด (Lochia rubra) ปริมาณน้อย, แผลฝีเย็บไม่มีลักษณะบวมแดง, เต้านมคัดตึงเล็กน้อย หัวนมปกติ ทารกดูดนมได้ดี
            ผลตรวจเลือด: ระดับน้ำตาลในเลือดหลังคลอดกลับมาอยู่ในเกณฑ์ปกติแล้ว
            คำสั่งการรักษาของแพทย์ก่อนจำหน่าย (Discharge Order):
            จำหน่ายกลับบ้านได้ (Discharge today)
            นัดตรวจหลังคลอด 6 สัปดาห์ (Follow up at 6 weeks postpartum)
            ยาที่ให้กลับบ้าน: Ferrous fumarate 1x1 oral pc, Ibuprofen 400 mg 1 tab oral prn for pain
            "
            questions={[
                "หลังแพทย์มีคำสั่งให้จำหน่ายกลับบ้านได้ นักศึกษาคำจะให้แนะนำในการปฏิบัติตัวที่บ้านอย่างไร"
            ]}
            videoSrc="/ob/ob5.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab5Recording;