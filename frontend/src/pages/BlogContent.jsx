import { useParams, useNavigate } from 'react-router-dom';
import coverImage from '../assets/img2.jpg';
import iosVoiceRecorder from '../assets/ios-voice-record.jpeg';
import androidVoiceRecorder from '../assets/android-voice-recorder.jpg';

const blogDetails = [
    {
        id: 1,
        title: "คู่มือการใช้งานระบบ Virtual Nurse Lab สำหรับผู้ใช้ iOS",
        date: "ธันวาคม 2024",
        content: `
<h2><strong>การใช้งานระบบ Virtual Nurse Lab</strong></h2>

<h3>1. การบันทึกเสียง</h3>
<p>1.1 เปิดแอพพลิเคชั่น "Voice Memos" หรือแอพบันทึกเสียงพื้นฐานที่มาพร้อมกับระบบปฎิบัติการของท่าน</p>
<p>1.2 กดปุ่มสีแดงเพื่อเริ่มการบันทึกเสียง พูดบรรยายคำตอบของตนเอง</p>
<p>1.3 เมื่อพูดจบ กดปุ่มหยุดการบันทึก</p>

<h3>2. การอัพโหลดไฟล์เสียงเข้าสู่ระบบ Virtual Nurse Lab</h3>
<p>2.1 เข้าสู่เว็บไซต์หรือแอพพลิเคชั่น Virtual Nurse Lab</p>
<p>2.2 ล็อกอินเข้าสู่ระบบด้วยบัญชีผู้ใช้ของคุณ</p>
<p>2.3 เลือกเมนู "อัพโหลดไฟล์เสียง"</p>
<p>2.4 กดปุ่ม "เลือกไฟล์" และเลือกไฟล์เสียงที่คุณได้บันทึกไว้</p>
<p>2.5 กดปุ่ม "ส่งข้อมูล" เพื่อส่งไฟล์เข้าสู่ระบบ</p>

<h3>3. การรับผลการวิเคราะห์จาก AI</h3>
<p>3.1 หลังจากอัพโหลดไฟล์เสียงเสร็จสิ้น ระบบจะแสดงข้อความยืนยันการรับไฟล์</p>
<p>3.2 ระบบ AI จะใช้เวลาประมาณ 1-2 นาทีในการประมวลผลและวิเคราะห์ข้อมูล</p>
<p>3.3 เมื่อการวิเคราะห์เสร็จสิ้น คุณจะได้รับการแจ้งเตือนผ่านหน้าจอ</p>

<h3>4. การอ่านและทำความเข้าใจผลการวิเคราะห์</h3>
<p>4.1 ผลการวิเคราะห์จะแสดงในรูปแบบรายงานที่เข้าใจง่าย</p>
<p>4.2 ระบบจะแสดงสิ่งที่นักศึกษาทำได้ดีพร้อมกับคำแนะนำ</p>

<h3>5. การรักษาความปลอดภัยของข้อมูล</h3>
<p>ระบบ Virtual Nurse Lab ให้ความสำคัญกับความเป็นส่วนตัวและความปลอดภัยของข้อมูลผู้ใช้อย่างสูงสุด โดย:</p>
<ul>
    <li>ใช้การเข้ารหัสข้อมูลระดับสูงในการส่งและจัดเก็บข้อมูล</li>
    <li>ไม่เปิดเผยข้อมูลส่วนบุคคลของผู้ใช้แก่บุคคลที่สามโดยไม่ได้รับอนุญาต</li>
</ul>

<p>หากคุณมีคำถามหรือต้องการความช่วยเหลือเพิ่มเติม กรุณาติดต่อ virtualnurselab@gmail.com</p>
        `
    },
];

const BlogContent = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const blog = blogDetails.find(blog => blog.id === parseInt(id));

    const handleBack = () => {
        navigate(-1);
    };

    if (!blog) {
        return <div>Blog post not found</div>;
    }

    return (
        <div className="min-h-screen flex justify-center px-4 sm:px-6 lg:px-8">
            <div className="writingContainer w-full max-w-[500px] relative my-8 sm:my-12 text-base leading-[30px]">
                <button 
                    onClick={handleBack}
                    className="mb-4 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition duration-300"
                >
                    &#8592; Back
                </button>
                <p className="text-gray-600 mb-2 text-sm sm:text-base">{blog.date}</p>
                <h1 className="text-2xl sm:text-4xl font-bold mb-4 text-gray-800">{blog.title}</h1>
                <img src={iosVoiceRecorder} alt={blog.title} className="w-full h-auto object-cover mb-4 rounded"/>
                <div 
                    className="text-gray-700 text-sm sm:text-base"
                    dangerouslySetInnerHTML={{ __html: blog.content }}
                />
            </div>
        </div>
    );
};

export default BlogContent;