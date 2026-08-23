import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import FundamentalRecordingComponent from './FundamentalRecordingComponent';

const MAX_ATTEMPTS = 3;

const Fundamental2 = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('th');
    const { token } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/fundamental/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab2 = response.data.labs.find(lab => lab.labInfo.labNumber === 2);
                if (lab2) {
                    setAttemptsLeft(lab2.attemptsLeft);
                }
            } catch (error) {
                console.error('Error fetching lab info:', error);
            }
        };
        fetchLabInfo();
    }, [token]);

    const handleLanguageChange = (event) => {
        const newLanguage = event.target.value;
        setLanguage(newLanguage);

        if (newLanguage === 'en') {
            navigate('/student/fundamental/2en');
        }
    };

    return (
        <FundamentalRecordingComponent
            labNumber={2}
            title="สถานการณ์ที่ 2: การพยาบาลผู้ป่วยที่ได้รับสารน้ำทางหลอดเลือดดำ"
            subtitle=""
            description="นายสมชาย อายุ 45 ปี เข้ารับการรักษาด้วยภาวะกระเพาะอาหารและลำไส้อักเสบเฉียบพลัน (acute gastroenteritis) ร่วมกับภาวะขาดน้ำระดับปานกลาง แผนการรักษา: 0.9% NSS 1,000 mL IV drip 80 mL/hr และ record intake/output ทุก 8 ชั่วโมง ผู้ป่วยมี IV cannula เบอร์ 22 ที่แขนซ้ายท่อนล่าง ใส่มาแล้ว 2 วัน ต่อกับชุดให้สารน้ำมาตรฐาน (drop factor 20 drops/mL) นักศึกษาพยาบาลได้รับมอบหมายให้ดูแลผู้ป่วยรายนี้ในเวร"
            questions={[
                "จงคำนวณอัตราหยดของสารน้ำเป็นหยดต่อนาที (แสดงวิธีคำนวณ) และบอกสิ่งที่ต้องตรวจสอบก่อนปรับอัตราหยด",
                "จงอธิบายการพยาบาลที่จำเป็นสำหรับผู้ป่วยรายนี้ขณะได้รับสารน้ำทางหลอดเลือดดำ รวมทั้งการบันทึกสารน้ำเข้า-ออก"
            ]}
            videoSrc="/fundamental/2.%20TH%20Fundamental%20Nursing%20—%20IV%20Fluid%20Therapy.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Fundamental2;
