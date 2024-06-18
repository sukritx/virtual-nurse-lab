import { useParams } from 'react-router-dom';
import { NavigationMenu } from '../components/NavigationMenu';
import img1 from '../assets/GettyImages-1289379328.png';

const blogDetails = [
    {
        id: 1,
        title: "Top CMU Online Courses for Nursing",
        date: "Published August 31, 2023",
        content: `
        The transition between a graduation ceremony and the next step in an academic or professional journey can be both exciting and daunting. After the celebrations are over and another autumn rolls around, it's time to consider the right course of study that will help you achieve your goals.
        
        In 2023, the National Center for Education Statistics reported that more than 3.3 million students graduated from high school. Of those graduates, more than half are expected to go on to enroll in higher education programs. What will they choose to study? What are the courses and majors that will serve them in their professional and personal development?
        
        Similarly, in 2020, it was reported by the Education Data Initiative that more than 4 million people graduated from higher education programs with either an Associate's or Bachelor's Degree. How will they apply their newly acquired knowledge and skills in their careers? And most importantly, how will they thrive on a new self-directed learning path?
        
        While each person's learning path is unique, it is not surprising that some of the fastest growing and most widely applicable fields of study overlap with some of the most popular college majors. Whether you're looking ahead to your first semester of college, taking a gap year, bulkying up your resume to search for your first real job after college, or are excited to go back to learning after a longer hiatus, a good first step in deciding what you'd like to study next is to explore a variety of options.
        
        We have compiled a list of our top online courses for recent graduates to help them decide on and prepare for their next learning adventure:
        
        Business and Management
        Business is the most popular area of study on college campuses and for good reason. Knowledge and skills gained in business courses can be applied across a wide range of organizations and industries.
        
        Data Science for Business
        `
    },
];

const BlogContent = () => {
    const { id } = useParams();
    const blog = blogDetails.find(blog => blog.id === parseInt(id));

    return (
        <div className="bg-gray-100 min-h-screen">
            <NavigationMenu />
            <div className="w-full max-w-4xl mx-auto mt-6 p-6 bg-white rounded-lg shadow-md">
                <h1 className="text-3xl font-bold mb-4 text-gray-800">{blog.title}</h1>
                <p className="text-gray-600 mb-4">{blog.date}</p>
                <img src={img1} alt={blog.title} className="w-full h-64 object-cover mb-4"/>
                <div className="text-gray-700 whitespace-pre-line">{blog.content}</div>
            </div>
        </div>
    );
};

export default BlogContent;
