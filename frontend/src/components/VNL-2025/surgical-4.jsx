// surgical-4.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import LabRecordingComponent from './SurgicalRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab4Recording = () => {
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
                const lab4 = response.data.labs.find(lab => lab.labInfo.labNumber === 4);
                if (lab4) {
                    setAttemptsLeft(lab4.attemptsLeft);
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
            labNumber={4}
            title="สถานการณ์ที่4: การพยาบาลผู้ป่วยที่ใส่ท่อระบายทรวงอก"
            subtitle=""
            description="
            ผู้ป่วยชายอายุ 65 ปี ตรวจพบก้อนบริเวณปอดข้างขวา แพทย์วินิจฉัยว่าเป็นมะเร็งปอด (lung cancer) ได้รับการผ่าตัด Right thoracotomy to RLL lobectomy 
            ผลการตรวจร่างกาย: 
                หลังผ่าตัด ผู้ป่วยมีแผลผ่าตัดบริเวณทรวงอกด้านขวาปิดก๊อซไว้แห้งดี ปวดแผลผ่าตัด pain score = 3  Retained right ICD with under water sealed น้ำในหลอดแก้วยาวในขวดรองรับไม่ fluctuate สารเหลวในขวดรองรับสีแดง คลำผิวหนังรอบ ๆ ตำแหน่งที่ใส่สาย ICD ไม่พบ Subcutaneous emphysema มีอาการเหนื่อยเล็กน้อยเมื่อทำกิจกรรม
            สัญญาณชีพ: 
            อุณหภูมิร่างกาย 37.2 องศาเซลเซียส อัตราชีพจร 82 ครั้งต่อนาที อัตราการหายใจ 22 ครั้งต่อนาที ความดันโลหิต 120/76 มิลลิเมตรปรอท ค่าความอิ่มตัวของออกซิเจนในเลือด (SaO2) 97% 
            "
            questions={[
                "ท่านจะดูแลการระบายของ ICD ให้มีประสิทธิภาพในผู้ป่วยรายนี้ได้อย่างไร (จงอธิบายวัตถุประสงค์ของการทำ underwater sealed การดูแลการระบาย การประเมิน fluctuation การจัดท่านอน การกระตุ้นให้ผู้ป่วยบริหารการหายใจ และหากเกิดสายท่ออุดตัน ควรทำอย่างไร)"
            ]}
            videoSrc="/surgical/surgical4.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab4Recording;