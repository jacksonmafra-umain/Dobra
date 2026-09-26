// Sample content shown on the simulated screens. Copy is from the Sample design system Figma frames where it exists.
import { asset } from './assets';

export interface Tone {
  bg: string;
  fg: string;
}

export interface NewsStory {
  title: string;
  body?: string;
  image: string;
  tone?: Tone;
}

export interface Restaurant {
  name: string;
  distance: string;
  address: string;
  hours: string;
}

export interface Reward {
  name: string;
  image: string;
  badge: string;
  status: 'available' | 'unavailable' | 'locked' | 'active';
  unused?: boolean;
}

export interface OrderLine {
  name: string;
  detail: string;
  price: string;
  qty: number;
  image: string;
}

const DARK_TONE: Tone = { bg: '#020c19', fg: '#ffffff' };

export const NEWS_STORIES: NewsStory[] = [
  { title: 'Classic Burger is back with extra sauce', body: 'Only in the app this week', image: asset('CardImage1510.png') },
  { title: 'Kids Meal: new toys every Monday', body: 'Collect all six', image: asset('CardImage.png') },
  {
    title: 'Late night? We’re open till 03:00',
    body: 'Selected restaurants',
    image: asset('CardImage1511.png'),
    tone: DARK_TONE,
  },
  {
    title: 'Double points on Café',
    body: 'Until Sunday',
    image: asset('CardImage1510.png'),
    tone: { bg: '#f1ece8', fg: '#292929' },
  },
  { title: 'Drive-thru now takes app orders', image: asset('CardImage1511.png'), tone: DARK_TONE },
  { title: 'Find your nearest restaurant', image: asset('CardImage1511.png'), tone: DARK_TONE },
];

export const RESTAURANTS: Restaurant[] = [
  { name: 'Hötorget', distance: '0.3 km', address: 'Kungsgatan 50, Stockholm', hours: 'Closes 23:59' },
  { name: 'Vasagatan', distance: '0.9 km', address: 'Vasagatan 24, Stockholm', hours: 'Closes 23:59' },
  { name: 'Regeringsgatan', distance: '1.2 km', address: 'Regeringsgatan 20, Stockholm', hours: 'Closes 23:59' },
];

export const REWARDS: Reward[] = [
  { name: 'Classic Burger', image: asset('reward_burger.png'), badge: '1 200 pts', status: 'available' },
  { name: 'Medium Fries', image: asset('reward_fries.png'), badge: '450 pts', status: 'available' },
  { name: 'Small Coffee', image: asset('reward_small_coffee.png'), badge: '200 pts', status: 'available' },
  { name: 'Egg Muffin', image: asset('reward_egg_muffin.png'), badge: '600 pts', status: 'available' },
  { name: 'Combo Cheese Meal', image: asset('reward_combo_meal.png'), badge: '2 000 pts', status: 'locked' },
];

export const BONUSES = [
  'Double points on all meals every Friday & Saturday',
  '+150 points when you order before 10:00',
  'Triple points on Café drinks this week',
  '+100 points on your first delivery order',
];

export const DEALS = [
  { name: 'Breakfast Muffin Sausage & Egg + medium Latte 40 kr', expiresSoon: true },
  { name: 'Classic Burger Meal 69 kr', expiresSoon: false },
  { name: '2 for 1 Cheeseburgers', expiresSoon: false },
  { name: 'Free Soft Serve with any meal over 99 kr', expiresSoon: true },
  { name: 'Kids Meal 45 kr', expiresSoon: false },
  { name: 'Chicken bites 9 pcs 49 kr', expiresSoon: false },
];

const BIG_MAC_REWARD: Reward = {
  name: 'Classic Burger',
  image: asset('reward_burger.png'),
  badge: 'Reward',
  status: 'available',
  unused: true,
};

export const UNUSED_REWARDS: Reward[] = [
  BIG_MAC_REWARD,
  BIG_MAC_REWARD,
  BIG_MAC_REWARD,
  { ...BIG_MAC_REWARD, status: 'unavailable' },
];

const QP_MEAL: Reward = {
  name: 'Medium Combo Cheese Meal',
  image: asset('reward_combo_meal.png'),
  badge: '1000 pts',
  status: 'locked',
};

export const REDEEMABLE_REWARDS: Reward[] = [
  { name: 'Small Coffee', image: asset('reward_small_coffee.png'), badge: '200 pts', status: 'active' },
  { name: 'Egg Muffin', image: asset('reward_egg_muffin.png'), badge: '250 pts', status: 'unavailable' },
  { name: 'Medium French Fries', image: asset('reward_fries.png'), badge: '250 pts', status: 'available' },
  QP_MEAL,
  QP_MEAL,
  QP_MEAL,
];

export const BAG_LINES: OrderLine[] = [
  {
    name: 'Classic Burger Meal',
    detail: 'Medium · Fries · Cola Zero',
    price: '89 kr',
    qty: 1,
    image: asset('reward_combo_meal.png'),
  },
  { name: 'Breakfast Muffin Sausage & Egg', detail: 'No cheese', price: '42 kr', qty: 2, image: asset('reward_egg_muffin.png') },
  { name: 'Medium French Fries', detail: 'Extra salt', price: '29 kr', qty: 1, image: asset('reward_fries.png') },
  { name: 'Small Coffee', detail: 'Oat milk', price: '19 kr', qty: 1, image: asset('reward_small_coffee.png') },
];
