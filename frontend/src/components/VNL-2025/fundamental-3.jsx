import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import FundamentalRecordingComponent from './FundamentalRecordingComponent';

const MAX_ATTEMPTS = 3;

const Fundamental3 = () => {
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
                const lab3 = response.data.labs.find(lab => lab.labInfo.labNumber === 3);
                if (lab3) {
                    setAttemptsLeft(lab3.attemptsLeft);
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
            navigate('/student/fundamental/3en');
        }
    };

    return (
        <FundamentalRecordingComponent
            labNumber={3}
            title="สถานการณ์ที่ 3: การพยาบาลผู้ป่วยที่ได้รับอาหารทางสายยางให้อาหาร"
            subtitle=""
            description="นางแก้ว อายุ 72 ปี มีภาวะกลืนลำบาก (dysphagia) หลังเป็นโรคหลอดเลือดสมองตีบ (ischaemic stroke) ได้รับอาหารทางสายยาง แผนการรักษา: blenderised diet (BD) 300 mL × 4 มื้อต่อวัน ทาง NG tube และจัดศีรษะสูง 30-45 องศา ขณะให้และหลังให้อาหาร ขณะนี้เวลา 10.00 น. นักศึกษาพยาบาลได้รับมอบหมายให้ให้อาหารมื้อนี้ สายยางให้อาหาร NG tube เบอร์ 16 Fr คาอยู่ที่รูจมูกขวา ตำแหน่งขีดวัดภายนอกอยู่ที่ 55 เซนติเมตร มื้อก่อนหน้าให้เมื่อ 4 ชั่วโมงที่แล้ว"
            questions={[
                "ก่อนให้อาหาร จงอธิบายวิธีตรวจสอบข้างเตียง 2 วิธี เพื่อยืนยันว่าปลายสายยางให้อาหารยังคงอยู่ในกระเพาะอาหาร",
                "จงอธิบายการพยาบาลก่อน ขณะ และหลังการให้อาหารทางสายยางมื้อนี้"
            ]}
            videoSrc=""
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Fundamental3;
