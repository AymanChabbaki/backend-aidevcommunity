import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@aidevclub.com' },
    update: {},
    create: {
      email: 'admin@aidevclub.com',
      passwordHash: adminPassword,
      displayName: 'Admin User',
      role: 'ADMIN',
      bio: 'System administrator',
      skills: ['Management', 'Leadership'],
      publicProfile: true
    }
  });
  console.log('✅ Admin user created');

  // Create staff users
  const staffPassword = await bcrypt.hash('staff123', 10);
  const staff = await prisma.user.upsert({
    where: { email: 'staff@aidevclub.com' },
    update: {},
    create: {
      email: 'staff@aidevclub.com',
      passwordHash: staffPassword,
      displayName: 'Sarah Johnson',
      role: 'STAFF',
      staffRole: 'Event Coordinator',
      bio: 'Event organizer and community manager',
      skills: ['Event Management', 'Marketing'],
      publicProfile: true
    }
  });

  const staff2 = await prisma.user.upsert({
    where: { email: 'tech@aidevclub.com' },
    update: {},
    create: {
      email: 'tech@aidevclub.com',
      passwordHash: staffPassword,
      displayName: 'Michael Chen',
      role: 'STAFF',
      staffRole: 'Technical Lead',
      bio: 'Full-stack developer and AI enthusiast',
      skills: ['Python', 'Machine Learning', 'React'],
      github: 'https://github.com/michaelchen',
      linkedin: 'https://linkedin.com/in/michaelchen',
      publicProfile: true
    }
  });
  console.log('✅ Staff users created');

  // Create sample users
  const userPassword = await bcrypt.hash('user123', 10);
  const user1 = await prisma.user.upsert({
    where: { email: 'john@example.com' },
    update: {},
    create: {
      email: 'john@example.com',
      passwordHash: userPassword,
      displayName: 'John Doe',
      role: 'USER',
      bio: 'Full-stack developer passionate about AI',
      skills: ['JavaScript', 'React', 'Node.js', 'Python'],
      github: 'johndoe',
      linkedin: 'johndoe',
      publicProfile: true
    }
  });
  console.log('✅ Sample users created');

  // Create past events with images
  await prisma.event.create({
    data: {
      title: 'AI Workshop: Introduction to Machine Learning',
      description: 'Learn the fundamentals of machine learning with hands-on examples using Python and scikit-learn. Perfect for beginners!',
      locationType: 'PHYSICAL',
      locationText: 'Tech Hub, Room 301',
      startAt: new Date('2024-10-15T14:00:00'),
      endAt: new Date('2024-10-15T17:00:00'),
      capacity: 50,
      imageUrl: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&h=600&fit=crop',
      category: 'Workshop',
      speaker: 'Dr. Emily Watson',
      status: 'COMPLETED',
      tags: ['AI', 'Machine Learning', 'Python'],
      organizerId: admin.id
    }
  });

  await prisma.event.create({
    data: {
      title: 'Hackathon 2024: Build the Future',
      description: '48-hour hackathon focused on AI-powered solutions for social good. Teams competed for amazing prizes!',
      locationType: 'PHYSICAL',
      locationText: 'Innovation Center',
      startAt: new Date('2024-09-20T09:00:00'),
      endAt: new Date('2024-09-22T18:00:00'),
      capacity: 100,
      imageUrl: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&h=600&fit=crop',
      category: 'Competition',
      speaker: 'Multiple Judges',
      status: 'COMPLETED',
      tags: ['Hackathon', 'AI', 'Competition'],
      organizerId: staff.id
    }
  });

  await prisma.event.create({
    data: {
      title: 'Web Development Bootcamp',
      description: 'Intensive 3-day bootcamp covering React, Node.js, and MongoDB. Built full-stack applications from scratch.',
      locationType: 'PHYSICAL',
      locationText: 'Dev Center, Main Hall',
      startAt: new Date('2024-08-10T09:00:00'),
      endAt: new Date('2024-08-12T17:00:00'),
      capacity: 30,
      imageUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&h=600&fit=crop',
      category: 'Workshop',
      speaker: 'Michael Chen',
      status: 'COMPLETED',
      tags: ['Web Development', 'React', 'Node.js'],
      organizerId: staff2.id
    }
  });

  await prisma.event.create({
    data: {
      title: 'AI Ethics Panel Discussion',
      description: 'Industry experts discussed the ethical implications of AI and how to build responsible AI systems.',
      locationType: 'VIRTUAL',
      locationText: 'Online - Zoom',
      startAt: new Date('2024-11-05T18:00:00'),
      endAt: new Date('2024-11-05T20:00:00'),
      capacity: 200,
      imageUrl: 'https://images.unsplash.com/photo-1591453089816-0fbb971b454c?w=800&h=600&fit=crop',
      category: 'Tech Talk',
      speaker: 'Panel of 5 Experts',
      status: 'COMPLETED',
      tags: ['AI Ethics', 'Panel', 'Discussion'],
      organizerId: admin.id
    }
  });

  await prisma.event.create({
    data: {
      title: 'Cloud Computing Workshop',
      description: 'Learned how to deploy and manage applications on AWS, Azure, and Google Cloud Platform.',
      locationType: 'PHYSICAL',
      locationText: 'Tech Campus, Lab 5',
      startAt: new Date('2024-07-22T10:00:00'),
      endAt: new Date('2024-07-22T16:00:00'),
      capacity: 40,
      imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=600&fit=crop',
      category: 'Workshop',
      speaker: 'David Park',
      status: 'COMPLETED',
      tags: ['Cloud', 'AWS', 'Azure'],
      organizerId: staff.id
    }
  });

  await prisma.event.create({
    data: {
      title: 'Mobile App Development Meetup',
      description: 'Monthly meetup for mobile developers. Shared projects, got feedback, and networked with peers.',
      locationType: 'PHYSICAL',
      locationText: 'Coffee & Code Cafe',
      startAt: new Date('2024-11-18T19:00:00'),
      endAt: new Date('2024-11-18T21:00:00'),
      capacity: 25,
      imageUrl: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800&h=600&fit=crop',
      category: 'Meetup',
      speaker: 'Community-led',
      status: 'COMPLETED',
      tags: ['Mobile', 'iOS', 'Android'],
      organizerId: staff2.id
    }
  });

  // Create upcoming events
  await prisma.event.create({
    data: {
      title: 'Deep Learning with PyTorch',
      description: 'Advanced workshop on building neural networks with PyTorch. Cover CNNs, RNNs, and transformers.',
      locationType: 'PHYSICAL',
      locationText: 'AI Lab, Building A',
      startAt: new Date('2025-01-15T14:00:00'),
      endAt: new Date('2025-01-15T18:00:00'),
      capacity: 35,
      imageUrl: 'https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=800&h=600&fit=crop',
      category: 'Workshop',
      speaker: 'Dr. Sarah Williams',
      status: 'UPCOMING',
      tags: ['Deep Learning', 'PyTorch', 'AI'],
      organizerId: admin.id
    }
  });

  await prisma.event.create({
    data: {
      title: 'Startup Pitch Night',
      description: 'Watch innovative tech startups pitch their ideas to investors. Great networking opportunity!',
      locationType: 'PHYSICAL',
      locationText: 'Startup Hub Downtown',
      startAt: new Date('2025-02-10T18:00:00'),
      endAt: new Date('2025-02-10T21:00:00'),
      capacity: 80,
      imageUrl: 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=800&h=600&fit=crop',
      category: 'Social',
      speaker: 'Various Founders',
      status: 'UPCOMING',
      tags: ['Startup', 'Pitch', 'Networking'],
      organizerId: staff.id
    }
  });

  await prisma.event.create({
    data: {
      title: 'Cybersecurity Fundamentals',
      description: 'Learn essential cybersecurity concepts, common vulnerabilities, and how to protect your applications.',
      locationType: 'HYBRID',
      locationText: 'Security Center + Online',
      startAt: new Date('2025-01-25T16:00:00'),
      endAt: new Date('2025-01-25T18:00:00'),
      capacity: 60,
      imageUrl: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&h=600&fit=crop',
      category: 'Tech Talk',
      speaker: 'James Anderson',
      status: 'UPCOMING',
      tags: ['Cybersecurity', 'Security', 'Protection'],
      organizerId: staff2.id
    }
  });
  console.log('✅ Sample events created');

  // Create a sample poll
  const poll = await prisma.poll.create({
    data: {
      question: 'What technology topic interests you most?',
      options: [
        { id: 'opt1', text: 'Artificial Intelligence & ML' },
        { id: 'opt2', text: 'Web Development' },
        { id: 'opt3', text: 'Mobile Development' },
        { id: 'opt4', text: 'Cloud Computing' },
        { id: 'opt5', text: 'Cybersecurity' }
      ],
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      visibility: 'PUBLIC',
      status: 'ACTIVE',
      createdBy: staff.id
    }
  });
  console.log('✅ Sample poll created');

  // Create a sample form
  const form = await prisma.form.create({
    data: {
      title: 'Member Application Form',
      description: 'Tell us about yourself and why you want to join our community',
      fields: [
        {
          id: 'field1',
          type: 'text',
          label: 'Full Name',
          required: true
        },
        {
          id: 'field2',
          type: 'email',
          label: 'Email Address',
          required: true
        },
        {
          id: 'field3',
          type: 'textarea',
          label: 'Why do you want to join?',
          required: true
        },
        {
          id: 'field4',
          type: 'select',
          label: 'Experience Level',
          options: ['Beginner', 'Intermediate', 'Advanced'],
          required: true
        }
      ],
      createdBy: staff.id
    }
  });
  console.log('✅ Sample form created');

  console.log('🎉 Database seeding completed!');
  console.log('\n📝 Sample credentials:');
  console.log('Admin: admin@aidevclub.com / admin123');
  console.log('Staff: staff@aidevclub.com / staff123');
  console.log('User: john@example.com / user123');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
