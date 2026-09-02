#!/usr/bin/env node

/**
 * Database Seeding Script for Wrap & Roll POS
 * This script populates the database with:
 * - Menu items (wraps, salads, rolls, pizzas, burgers, combos, drinks)
 * - Inventory items with stock levels
 * - Categories and modifiers
 * - Staff members and roles
 * - Sample transactions for testing
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../wraproll.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Menu Categories
const CATEGORIES = {
  wraps: { id: 'cat_wraps', name: 'Wraps', description: 'Fresh wraps with various fillings', icon: 'wrap', display_order: 1 },
  salads: { id: 'cat_salads', name: 'Salads', description: 'Healthy salads with protein options', icon: 'salad', display_order: 2 },
  rolls: { id: 'cat_rolls', name: 'Rolls', description: 'Half and full rolls', icon: 'roll', display_order: 3 },
  pizzas: { id: 'cat_pizzas', name: 'Pizzas', description: 'Hot pizzas in multiple sizes', icon: 'pizza', display_order: 4 },
  burgers: { id: 'cat_burgers', name: 'Burgers', description: 'Delicious burgers', icon: 'burger', display_order: 5 },
  combos: { id: 'cat_combos', name: 'Combo Meals', description: 'Great value combo packages', icon: 'combo', display_order: 6 },
  drinks: { id: 'cat_drinks', name: 'Drinks', description: 'Hot and cold beverages', icon: 'drink', display_order: 7 },
};

// Menu Items
const MENU_ITEMS = [
  // WRAPS
  { id: 'mi_veggie_wrap', category_id: 'cat_wraps', name: 'Veggie Wrap', price: 12500, currency: 'TZS', description: 'Fresh vegetables wrapped', image_url: null },
  { id: 'mi_grilled_chicken_tandoori_wrap', category_id: 'cat_wraps', name: 'Grilled Chicken Tandoori Wrap', price: 19000, currency: 'TZS', description: 'Tandoori spiced chicken', image_url: null },
  { id: 'mi_grilled_chicken_lemon_wrap', category_id: 'cat_wraps', name: 'Grilled Chicken Lemon Wrap', price: 19000, currency: 'TZS', description: 'Lemon flavored chicken', image_url: null },
  { id: 'mi_house_steak_wrap', category_id: 'cat_wraps', name: 'House Steak Wrap', price: 20000, currency: 'TZS', description: 'Premium steak wrap', image_url: null },
  { id: 'mi_smoked_beef_wrap', category_id: 'cat_wraps', name: 'Smoked Beef Wrap', price: 20000, currency: 'TZS', description: 'Smoked beef specialty', image_url: null },
  { id: 'mi_pastrami_beef_wrap', category_id: 'cat_wraps', name: 'Pastrami Beef Wrap', price: 20000, currency: 'TZS', description: 'Pastrami beef wrap', image_url: null },
  { id: 'mi_classic_tuna_wrap', category_id: 'cat_wraps', name: 'Classic Tuna Wrap', price: 20000, currency: 'TZS', description: 'Fresh tuna wrap', image_url: null },
  { id: 'mi_sweet_bbq_chicken_wrap', category_id: 'cat_wraps', name: 'Sweet/BBQ Chicken Wrap', price: 19000, currency: 'TZS', description: 'BBQ chicken wrap', image_url: null },

  // SALADS
  { id: 'mi_veggie_salad', category_id: 'cat_salads', name: 'Veggie Salad', price: 12500, currency: 'TZS', description: 'Fresh vegetable salad', image_url: null },
  { id: 'mi_grilled_chicken_tandoori_salad', category_id: 'cat_salads', name: 'Grilled Chicken Tandoori Salad', price: 19000, currency: 'TZS', description: 'Tandoori chicken salad', image_url: null },
  { id: 'mi_grilled_chicken_lemon_salad', category_id: 'cat_salads', name: 'Grilled Chicken Lemon Salad', price: 19000, currency: 'TZS', description: 'Lemon chicken salad', image_url: null },
  { id: 'mi_house_steak_salad', category_id: 'cat_salads', name: 'House Steak Salad', price: 20000, currency: 'TZS', description: 'Premium steak salad', image_url: null },
  { id: 'mi_smoked_beef_salad', category_id: 'cat_salads', name: 'Smoked Beef Salad', price: 20000, currency: 'TZS', description: 'Smoked beef salad', image_url: null },
  { id: 'mi_pastrami_beef_salad', category_id: 'cat_salads', name: 'Pastrami Beef Salad', price: 20000, currency: 'TZS', description: 'Pastrami beef salad', image_url: null },
  { id: 'mi_classic_tuna_salad', category_id: 'cat_salads', name: 'Classic Tuna Salad', price: 19000, currency: 'TZS', description: 'Fresh tuna salad', image_url: null },
  { id: 'mi_sweet_bbq_chicken_salad', category_id: 'cat_salads', name: 'Sweet/BBQ Chicken Salad', price: 19000, currency: 'TZS', description: 'BBQ chicken salad', image_url: null },
  { id: 'mi_house_salad_all_toppings', category_id: 'cat_salads', name: 'House Salad - All Toppings', price: 24000, currency: 'TZS', description: 'All veggies, meat, jalapenos, olives, avocado (seasonal)', image_url: null },

  // ROLLS
  { id: 'mi_veggie_roll_half', category_id: 'cat_rolls', name: 'Veggie Roll (Half)', price: 7000, currency: 'TZS', description: 'Half veggie roll', image_url: null },
  { id: 'mi_veggie_roll_full', category_id: 'cat_rolls', name: 'Veggie Roll (Full)', price: 13000, currency: 'TZS', description: 'Full veggie roll', image_url: null },
  { id: 'mi_grilled_chicken_tandoori_roll_half', category_id: 'cat_rolls', name: 'Grilled Chicken Tandoori Roll (Half)', price: 13000, currency: 'TZS', description: 'Half tandoori chicken roll', image_url: null },
  { id: 'mi_grilled_chicken_tandoori_roll_full', category_id: 'cat_rolls', name: 'Grilled Chicken Tandoori Roll (Full)', price: 24000, currency: 'TZS', description: 'Full tandoori chicken roll', image_url: null },
  { id: 'mi_grilled_lemon_chicken_roll_half', category_id: 'cat_rolls', name: 'Grilled Lemon Chicken Roll (Half)', price: 13000, currency: 'TZS', description: 'Half lemon chicken roll', image_url: null },
  { id: 'mi_grilled_lemon_chicken_roll_full', category_id: 'cat_rolls', name: 'Grilled Lemon Chicken Roll (Full)', price: 24000, currency: 'TZS', description: 'Full lemon chicken roll', image_url: null },
  { id: 'mi_sweet_bbq_chicken_roll_half', category_id: 'cat_rolls', name: 'Sweet/BBQ Chicken Roll (Half)', price: 13000, currency: 'TZS', description: 'Half BBQ chicken roll', image_url: null },
  { id: 'mi_sweet_bbq_chicken_roll_full', category_id: 'cat_rolls', name: 'Sweet/BBQ Chicken Roll (Full)', price: 25000, currency: 'TZS', description: 'Full BBQ chicken roll', image_url: null },
  { id: 'mi_house_steak_roll_half', category_id: 'cat_rolls', name: 'House Steak Roll (Half)', price: 14000, currency: 'TZS', description: 'Half steak roll', image_url: null },
  { id: 'mi_house_steak_roll_full', category_id: 'cat_rolls', name: 'House Steak Roll (Full)', price: 25000, currency: 'TZS', description: 'Full steak roll', image_url: null },
  { id: 'mi_smoked_beef_roll_half', category_id: 'cat_rolls', name: 'Smoked Beef Roll (Half)', price: 14000, currency: 'TZS', description: 'Half smoked beef roll', image_url: null },
  { id: 'mi_smoked_beef_roll_full', category_id: 'cat_rolls', name: 'Smoked Beef Roll (Full)', price: 25000, currency: 'TZS', description: 'Full smoked beef roll', image_url: null },
  { id: 'mi_pastrami_beef_roll_half', category_id: 'cat_rolls', name: 'Pastrami Beef Roll (Half)', price: 14000, currency: 'TZS', description: 'Half pastrami roll', image_url: null },
  { id: 'mi_pastrami_beef_roll_full', category_id: 'cat_rolls', name: 'Pastrami Beef Roll (Full)', price: 25000, currency: 'TZS', description: 'Full pastrami roll', image_url: null },
  { id: 'mi_classic_tuna_roll_half', category_id: 'cat_rolls', name: 'Classic Tuna Roll (Half)', price: 14000, currency: 'TZS', description: 'Half tuna roll', image_url: null },
  { id: 'mi_classic_tuna_roll_full', category_id: 'cat_rolls', name: 'Classic Tuna Roll (Full)', price: 25000, currency: 'TZS', description: 'Full tuna roll', image_url: null },

  // PIZZAS
  { id: 'mi_chicken_pizza_small', category_id: 'cat_pizzas', name: 'Chicken Pizza (Small)', price: 12500, currency: 'TZS', description: 'Small chicken pizza', image_url: null },
  { id: 'mi_chicken_pizza_medium', category_id: 'cat_pizzas', name: 'Chicken Pizza (Medium)', price: 19000, currency: 'TZS', description: 'Medium chicken pizza', image_url: null },
  { id: 'mi_chicken_pizza_large', category_id: 'cat_pizzas', name: 'Chicken Pizza (Large)', price: 23000, currency: 'TZS', description: 'Large chicken pizza', image_url: null },
  { id: 'mi_chicken_mushroom_pizza_small', category_id: 'cat_pizzas', name: 'Chicken and Mushroom Pizza (Small)', price: 12500, currency: 'TZS', description: 'Small chicken & mushroom pizza', image_url: null },
  { id: 'mi_chicken_mushroom_pizza_medium', category_id: 'cat_pizzas', name: 'Chicken and Mushroom Pizza (Medium)', price: 19000, currency: 'TZS', description: 'Medium chicken & mushroom pizza', image_url: null },
  { id: 'mi_chicken_mushroom_pizza_large', category_id: 'cat_pizzas', name: 'Chicken and Mushroom Pizza (Large)', price: 23000, currency: 'TZS', description: 'Large chicken & mushroom pizza', image_url: null },
  { id: 'mi_hawaiian_chicken_pizza_small', category_id: 'cat_pizzas', name: 'Hawaiian Chicken Pizza (Small)', price: 12500, currency: 'TZS', description: 'Small Hawaiian chicken pizza (seasonal)', image_url: null },
  { id: 'mi_hawaiian_chicken_pizza_medium', category_id: 'cat_pizzas', name: 'Hawaiian Chicken Pizza (Medium)', price: 19000, currency: 'TZS', description: 'Medium Hawaiian chicken pizza (seasonal)', image_url: null },
  { id: 'mi_hawaiian_chicken_pizza_large', category_id: 'cat_pizzas', name: 'Hawaiian Chicken Pizza (Large)', price: 23000, currency: 'TZS', description: 'Large Hawaiian chicken pizza (seasonal)', image_url: null },
  { id: 'mi_steak_pizza_small', category_id: 'cat_pizzas', name: 'Steak Pizza (Small)', price: 12500, currency: 'TZS', description: 'Small steak pizza', image_url: null },
  { id: 'mi_steak_pizza_medium', category_id: 'cat_pizzas', name: 'Steak Pizza (Medium)', price: 19000, currency: 'TZS', description: 'Medium steak pizza', image_url: null },
  { id: 'mi_steak_pizza_large', category_id: 'cat_pizzas', name: 'Steak Pizza (Large)', price: 23000, currency: 'TZS', description: 'Large steak pizza', image_url: null },
  { id: 'mi_russian_beef_sausage_pizza_small', category_id: 'cat_pizzas', name: 'Russian Beef Sausage Pizza (Small)', price: 12500, currency: 'TZS', description: 'Small beef sausage pizza', image_url: null },
  { id: 'mi_russian_beef_sausage_pizza_medium', category_id: 'cat_pizzas', name: 'Russian Beef Sausage Pizza (Medium)', price: 19000, currency: 'TZS', description: 'Medium beef sausage pizza', image_url: null },
  { id: 'mi_russian_beef_sausage_pizza_large', category_id: 'cat_pizzas', name: 'Russian Beef Sausage Pizza (Large)', price: 23000, currency: 'TZS', description: 'Large beef sausage pizza', image_url: null },
  { id: 'mi_meaty_lovers_small', category_id: 'cat_pizzas', name: 'Meaty Lovers (Small)', price: 19000, currency: 'TZS', description: 'Small meaty lovers pizza', image_url: null },
  { id: 'mi_meaty_lovers_medium', category_id: 'cat_pizzas', name: 'Meaty Lovers (Medium)', price: 25000, currency: 'TZS', description: 'Medium meaty lovers pizza', image_url: null },
  { id: 'mi_meaty_lovers_large', category_id: 'cat_pizzas', name: 'Meaty Lovers (Large)', price: 30000, currency: 'TZS', description: 'Large meaty lovers pizza', image_url: null },
  { id: 'mi_veggie_delight_small', category_id: 'cat_pizzas', name: 'Veggie Delight (Small)', price: 10000, currency: 'TZS', description: 'Small vegetarian pizza', image_url: null },
  { id: 'mi_veggie_delight_medium', category_id: 'cat_pizzas', name: 'Veggie Delight (Medium)', price: 14000, currency: 'TZS', description: 'Medium vegetarian pizza', image_url: null },
  { id: 'mi_veggie_delight_large', category_id: 'cat_pizzas', name: 'Veggie Delight (Large)', price: 18000, currency: 'TZS', description: 'Large vegetarian pizza', image_url: null },

  // BURGERS
  { id: 'mi_beef_burger', category_id: 'cat_burgers', name: 'Beef Burger', price: 12500, currency: 'TZS', description: 'Classic beef burger (add jalapenos +1500)', image_url: null },
  { id: 'mi_chicken_burger', category_id: 'cat_burgers', name: 'Chicken Burger', price: 9000, currency: 'TZS', description: 'Crispy chicken burger', image_url: null },
  { id: 'mi_2x_beef_burger', category_id: 'cat_burgers', name: '2x Beef Burger', price: 18000, currency: 'TZS', description: 'Double beef burger', image_url: null },

  // COMBOS
  { id: 'mi_beef_chicken_burger_meal', category_id: 'cat_combos', name: 'Beef/Chicken Burger Meal', price: 13000, currency: 'TZS', description: 'Burger + 600ml soda', image_url: null },
  { id: 'mi_beef_chicken_burger_combo', category_id: 'cat_combos', name: 'Beef/Chicken Burger Combo', price: 17000, currency: 'TZS', description: 'Burger + small fries + 600ml soda', image_url: null },
  { id: 'mi_chicken_roll_lunchbox', category_id: 'cat_combos', name: 'Chicken Roll Lunchbox', price: 17000, currency: 'TZS', description: 'Half roll + small fries + 600ml soda', image_url: null },
  { id: 'mi_chicken_wrap_combo', category_id: 'cat_combos', name: 'Chicken Wrap Combo', price: 22000, currency: 'TZS', description: 'Sweet/BBQ wrap + small fries + 300ml soda', image_url: null },
  { id: 'mi_burger_pizza_combo', category_id: 'cat_combos', name: 'Burger and Pizza Combo', price: 34000, currency: 'TZS', description: '1 burger + 1 medium pizza + 2 small fries + 2 sodas 300ml', image_url: null },
  { id: 'mi_footlong_roll_combo', category_id: 'cat_combos', name: 'FootLong Roll Combo', price: 31000, currency: 'TZS', description: '1 full BBQ chicken roll + 1 medium fries + 2 small sodas 300ml', image_url: null },
  { id: 'mi_2x_pizza_combo', category_id: 'cat_combos', name: '2x Pizza Combo', price: 42000, currency: 'TZS', description: '2 medium pizzas + 1 medium fries + 2 sodas 600ml', image_url: null },
  { id: 'mi_pizza_2x_burger_combo', category_id: 'cat_combos', name: 'Pizza + 2x Burger Combo', price: 48000, currency: 'TZS', description: '1 medium pizza + 2 burgers + 2 small fries + 3 sodas 300ml', image_url: null },
  { id: 'mi_family_combo_package', category_id: 'cat_combos', name: 'Family Combo Package', price: 74000, currency: 'TZS', description: '2 large pizzas + 2 burgers + 2 medium fries + 1 soda 1.25L', image_url: null },

  // DRINKS - HOT
  { id: 'mi_americano_black', category_id: 'cat_drinks', name: 'Americano Black', price: 5500, currency: 'TZS', description: 'Hot black americano', image_url: null },
  { id: 'mi_americano_white', category_id: 'cat_drinks', name: 'Americano White', price: 6500, currency: 'TZS', description: 'Americano with milk', image_url: null },
  { id: 'mi_cappuccino', category_id: 'cat_drinks', name: 'Cappuccino', price: 6500, currency: 'TZS', description: 'Classic cappuccino', image_url: null },
  { id: 'mi_latte', category_id: 'cat_drinks', name: 'Latte', price: 7500, currency: 'TZS', description: 'Creamy latte', image_url: null },
  { id: 'mi_espresso', category_id: 'cat_drinks', name: 'Espresso', price: 4000, currency: 'TZS', description: 'Strong espresso shot', image_url: null },
  { id: 'mi_black_tea', category_id: 'cat_drinks', name: 'Black Tea', price: 3500, currency: 'TZS', description: 'Hot black tea', image_url: null },
  { id: 'mi_milk_tea', category_id: 'cat_drinks', name: 'Milk Tea', price: 5500, currency: 'TZS', description: 'Tea with milk', image_url: null },
  { id: 'mi_hot_chocolate', category_id: 'cat_drinks', name: 'Hot Chocolate', price: 6000, currency: 'TZS', description: 'Hot chocolate', image_url: null },

  // DRINKS - COLD
  { id: 'mi_iced_lattes', category_id: 'cat_drinks', name: 'Iced Lattes', price: 8000, currency: 'TZS', description: 'Cold iced latte', image_url: null },
  { id: 'mi_iced_americano', category_id: 'cat_drinks', name: 'Iced Americano', price: 5500, currency: 'TZS', description: 'Cold americano', image_url: null },
  { id: 'mi_iced_cappuccino', category_id: 'cat_drinks', name: 'Iced Cappuccino', price: 6500, currency: 'TZS', description: 'Cold cappuccino', image_url: null },
  { id: 'mi_iced_lemon_tea', category_id: 'cat_drinks', name: 'Iced Lemon Tea', price: 6000, currency: 'TZS', description: 'Cold lemon tea', image_url: null },
  { id: 'mi_iced_tea_mint', category_id: 'cat_drinks', name: 'Iced Tea Mint', price: 5000, currency: 'TZS', description: 'Mint iced tea', image_url: null },
  { id: 'mi_fresh_juice', category_id: 'cat_drinks', name: 'Fresh Juice (Seasonal)', price: 9000, currency: 'TZS', description: 'Fresh seasonal juice', image_url: null },

  // DRINKS - SOFT
  { id: 'mi_water_500ml', category_id: 'cat_drinks', name: 'Water 500ml', price: 1500, currency: 'TZS', description: 'Bottled water', image_url: null },
  { id: 'mi_soda_600ml', category_id: 'cat_drinks', name: 'Soda 600ml', price: 3000, currency: 'TZS', description: 'Soft drink 600ml', image_url: null },
  { id: 'mi_soda_1_25L', category_id: 'cat_drinks', name: 'Soda 1.25L', price: 5000, currency: 'TZS', description: 'Soft drink 1.25L', image_url: null },
  { id: 'mi_soda_300ml', category_id: 'cat_drinks', name: 'Soda 300ml', price: 1500, currency: 'TZS', description: 'Soft drink 300ml', image_url: null },
];

// Inventory Items
const INVENTORY_ITEMS = [
  // Meats & Dairy
  { id: 'inv_bbq_chicken', name: 'BBQ Chicken', sku: 'BBQ-CHK-1KG', pack_size: '1kg', pack_price: 16000, unit: 'grams', portion_size: 10, reorder_point: 1, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Meats & Dairy' },
  { id: 'inv_cheddar_cheese', name: 'Cheddar Cheese', sku: 'CHD-CHEESE-1KG', pack_size: '1kg', pack_price: 30000, unit: 'grams', portion_size: 1, reorder_point: 1, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Meats & Dairy' },
  { id: 'inv_chicken_strips', name: 'Chicken Strips', sku: 'CHK-STRIP-1KG', pack_size: '1kg', pack_price: 15000, unit: 'kg', portion_size: 1, reorder_point: 3, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Meats & Dairy' },
  { id: 'inv_milk', name: 'Milk', sku: 'MILK-500ML', pack_size: '500mL', pack_price: 15500, unit: 'mL', portion_size: 1, reorder_point: 1000, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Meats & Dairy' },
  { id: 'inv_minced_beef_burger', name: 'Minced Beef Burger', sku: 'BEEF-MINCE-1KG', pack_size: '1kg', pack_price: 14000, unit: 'kg', portion_size: 1, reorder_point: 1, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Meats & Dairy' },
  { id: 'inv_minced_chicken_burger', name: 'Minced Chicken Burger', sku: 'CHK-MINCE-500G', pack_size: '500g', pack_price: 14000, unit: 'grams', portion_size: 1, reorder_point: 1000, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Meats & Dairy' },
  { id: 'inv_mozarella_cheese', name: 'Mozarella Cheese', sku: 'MOZ-CHEESE-1KG', pack_size: '1kg', pack_price: 22000, unit: 'grams', portion_size: 1, reorder_point: 1, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Meats & Dairy' },
  { id: 'inv_pastrami', name: 'Pastrami', sku: 'PAST-500G', pack_size: '500', pack_price: 22000, unit: 'grams', portion_size: 1, reorder_point: 1000, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Meats & Dairy' },
  { id: 'inv_prestige_butter', name: 'Prestige Butter', sku: 'BUT-250G', pack_size: '250grams', pack_price: 5000, unit: 'grams', portion_size: 1, reorder_point: 500, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Meats & Dairy' },
  { id: 'inv_sausage', name: 'Sausage', sku: 'SAUS-1KG', pack_size: '1kg', pack_price: 8000, unit: 'grams', portion_size: 1, reorder_point: 1, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Meats & Dairy' },
  { id: 'inv_sliced_cheddar_cheese', name: 'Sliced Cheddar Cheese', sku: 'SLICED-CHD-400G', pack_size: '400grams', pack_price: 12000, unit: 'grams', portion_size: 1, reorder_point: 800, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Meats & Dairy' },
  { id: 'inv_smoked_beef', name: 'Smoked Beef', sku: 'SMOKED-500G', pack_size: '500grams', pack_price: 20000, unit: 'grams', portion_size: 1, reorder_point: 1000, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Meats & Dairy' },
  { id: 'inv_steak', name: 'Steak', sku: 'STEAK-1KG', pack_size: '1kg', pack_price: 14000, unit: 'grams', portion_size: 1, reorder_point: 3, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Meats & Dairy' },
  { id: 'inv_strawberry_ice_cream', name: 'Strawberry Ice Cream', sku: 'ICE-STRAW-5L', pack_size: '5L', pack_price: 35000, unit: 'mL', portion_size: 1, reorder_point: 10, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Meats & Dairy' },
  { id: 'inv_sweet_chicken', name: 'Sweet Chicken', sku: 'SWEET-CHK-1KG', pack_size: '1kg', pack_price: 17000, unit: 'grams', portion_size: 1, reorder_point: 1, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Meats & Dairy' },
  { id: 'inv_tikka_tandoori', name: 'Tikka (Tandoori)', sku: 'TIKKA-1KG', pack_size: '1kg', pack_price: 16000, unit: 'grams', portion_size: 1, reorder_point: 1, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Meats & Dairy' },
  { id: 'inv_tuna', name: 'Tuna', sku: 'TUNA-130', pack_size: '130', pack_price: 4100, unit: 'grams', portion_size: 1, reorder_point: 260, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Meats & Dairy' },
  { id: 'inv_vanilla_ice_cream', name: 'Vanilla Ice Cream', sku: 'ICE-VAN-5L', pack_size: '5L', pack_price: 30000, unit: 'mL', portion_size: 1, reorder_point: 10, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Meats & Dairy' },
  { id: 'inv_yoghurt', name: 'Yoghurt', sku: 'YOGH-500ML', pack_size: '500mL', pack_price: 1700, unit: 'mL', portion_size: 1, reorder_point: 1000, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Meats & Dairy' },

  // Sauces
  { id: 'inv_bbq_sauce', name: 'BBQ Sauce', sku: 'BBQ-SAUCE-525ML', pack_size: '525mL', pack_price: 11000, unit: 'mL', portion_size: 1, reorder_point: 1050, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Sauces' },
  { id: 'inv_brown_vinegar', name: 'Brown Vinegar', sku: 'VIN-BROWN-500ML', pack_size: '500mL', pack_price: 2000, unit: 'mL', portion_size: 1, reorder_point: 1000, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Sauces' },
  { id: 'inv_caramel_sauce', name: 'Caramel Sauce', sku: 'CAR-SAUCE-623G', pack_size: '623grams', pack_price: 15000, unit: 'grams', portion_size: 1, reorder_point: 1250, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Sauces' },
  { id: 'inv_chocolate_sauce', name: 'Chocolate Sauce', sku: 'CHOC-SAUCE-624G', pack_size: '624grams', pack_price: 18000, unit: 'grams', portion_size: 1, reorder_point: 1250, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Sauces' },
  { id: 'inv_honey', name: 'Honey', sku: 'HON-500G', pack_size: '500grams', pack_price: 10000, unit: 'grams', portion_size: 1, reorder_point: 1000, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Sauces' },
  { id: 'inv_honey_mustard', name: 'Honey Mustard', sku: 'HON-MUST-946ML', pack_size: '946mL', pack_price: 9000, unit: 'mL', portion_size: 1, reorder_point: 1000, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Sauces' },
  { id: 'inv_hot_chili_sauce', name: 'Hot Chili Sauce', sku: 'CHILI-850G', pack_size: '850grams', pack_price: 1700, unit: 'grams', portion_size: 1, reorder_point: 850, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Sauces' },
  { id: 'inv_ketchup_tomato', name: 'Ketchup Tomato', sku: 'KETCH-1.8KG', pack_size: '1.8kg', pack_price: 23000, unit: 'grams', portion_size: 1, reorder_point: 2, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Sauces' },
  { id: 'inv_mustard', name: 'Mustard', sku: 'MUST-391G', pack_size: '391grams', pack_price: 11000, unit: 'grams', portion_size: 1, reorder_point: 800, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Sauces' },
  { id: 'inv_olive_oil', name: 'Olive Oil', sku: 'OIL-OLIVE-250ML', pack_size: '250mL', pack_price: 22000, unit: 'mL', portion_size: 1, reorder_point: 500, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Sauces' },
  { id: 'inv_pizza_sauce', name: 'Pizza Sauce', sku: 'PIZ-SAUCE-380G', pack_size: '380grams', pack_price: 6000, unit: 'grams', portion_size: 1, reorder_point: 760, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Sauces' },
  { id: 'inv_sweet_onion', name: 'Sweet Onion', sku: 'SWEET-ONI-946ML', pack_size: '946mL', pack_price: 8000, unit: 'mL', portion_size: 1, reorder_point: 1900, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Sauces' },
  { id: 'inv_thousand_island', name: 'Thousand Island', sku: 'THOUS-ISL-946ML', pack_size: '946mL', pack_price: 10000, unit: 'mL', portion_size: 1, reorder_point: 1900, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Sauces' },
  { id: 'inv_tomato_satchets', name: 'Tomato Satchets', sku: 'TOM-SATCH-4KG', pack_size: '4kg', pack_price: 38600, unit: 'grams', portion_size: 1, reorder_point: 8, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Sauces' },
  { id: 'inv_vinegar', name: 'Vinegar', sku: 'VIN-473ML', pack_size: '473mL', pack_price: 6000, unit: 'mL', portion_size: 1, reorder_point: 960, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Sauces' },

  // Fruits & Vegetables
  { id: 'inv_avocado', name: 'Avocado', sku: 'AVO-1', pack_size: '1', pack_price: 1500, unit: 'each', portion_size: 1, reorder_point: 5, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Fruits & Vegetables' },
  { id: 'inv_carrots', name: 'Carrots', sku: 'CAR-1KG', pack_size: '1kg', pack_price: 2000, unit: 'grams', portion_size: 1, reorder_point: 1, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Fruits & Vegetables' },
  { id: 'inv_cooking_oil_fries', name: 'Cooking Oil Fries', sku: 'OIL-COOK-3L', pack_size: '3Liters', pack_price: 26000, unit: 'mL', portion_size: 1, reorder_point: 6, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Fruits & Vegetables' },
  { id: 'inv_cucumber', name: 'Cucumber', sku: 'CUC-1KG', pack_size: '1kg', pack_price: 2000, unit: 'grams', portion_size: 1, reorder_point: 2, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Fruits & Vegetables' },
  { id: 'inv_green_pepper', name: 'Green Pepper', sku: 'PEP-GREEN-1KG', pack_size: '1kg', pack_price: 3000, unit: 'grams', portion_size: 1, reorder_point: 2, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Fruits & Vegetables' },
  { id: 'inv_jalapenos', name: 'Jalapenos', sku: 'JAL-680G', pack_size: '680grams', pack_price: 8000, unit: 'grams', portion_size: 1, reorder_point: 1300, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Fruits & Vegetables' },
  { id: 'inv_lemons', name: 'Lemons', sku: 'LEM-1KG', pack_size: '1', pack_price: 16000, unit: 'kg', portion_size: 1, reorder_point: 5, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Fruits & Vegetables' },
  { id: 'inv_lettuce', name: 'Lettuce', sku: 'LET-1KG', pack_size: '1kg', pack_price: 3000, unit: 'grams', portion_size: 1, reorder_point: 2, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Fruits & Vegetables' },
  { id: 'inv_mint', name: 'Mint', sku: 'MINT-100G', pack_size: '100grams', pack_price: 1000, unit: 'grams', portion_size: 1, reorder_point: 200, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Fruits & Vegetables' },
  { id: 'inv_mushrooms', name: 'Mushrooms', sku: 'MUSH-400G', pack_size: '400grams', pack_price: 4500, unit: 'grams', portion_size: 1, reorder_point: 800, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Fruits & Vegetables' },
  { id: 'inv_olives', name: 'Olives', sku: 'OLI-175G', pack_size: '175grams', pack_price: 5000, unit: 'grams', portion_size: 1, reorder_point: 350, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Fruits & Vegetables' },
  { id: 'inv_onions', name: 'Onions', sku: 'ONI-1KG', pack_size: '1kg', pack_price: 2500, unit: 'grams', portion_size: 10, reorder_point: 2, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Fruits & Vegetables' },
  { id: 'inv_pickles', name: 'Pickles', sku: 'PICK-300G', pack_size: '300grams', pack_price: 4000, unit: 'grams', portion_size: 1, reorder_point: 600, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Fruits & Vegetables' },
  { id: 'inv_pili_pili_mbuzi', name: 'Pili Pili Mbuzi', sku: 'PILI-30G', pack_size: '30grams', pack_price: 500, unit: 'grams', portion_size: 1, reorder_point: 60, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Fruits & Vegetables' },
  { id: 'inv_pineapple', name: 'Pineapple', sku: 'PIN-1', pack_size: '1', pack_price: 6000, unit: 'each', portion_size: 1, reorder_point: 2, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Fruits & Vegetables' },
  { id: 'inv_potatoes', name: 'Potatoes', sku: 'POT-1KG', pack_size: '1kg', pack_price: 2000, unit: 'grams', portion_size: 1, reorder_point: 2, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Fruits & Vegetables' },
  { id: 'inv_tomato_veggie', name: 'Tomato (Veggie)', sku: 'TOM-1KG', pack_size: '1kg', pack_price: 2000, unit: 'grams', portion_size: 70, reorder_point: 2, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Fruits & Vegetables' },

  // Dried Ingredients
  { id: 'inv_black_pepper', name: 'Black Pepper', sku: 'PEP-BLACK-100G', pack_size: '100grams', pack_price: 7000, unit: 'grams', portion_size: 1, reorder_point: 200, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Dried Ingredients' },
  { id: 'inv_bread_crumbs', name: 'Bread Crumbs', sku: 'BREAD-CRU-1KG', pack_size: '1kg', pack_price: 3500, unit: 'grams', portion_size: 1, reorder_point: 1, vendor: 'Wrap & Roll', location: 'MISC TZ Location', group: 'Dried Ingredients' },
  { id: 'inv_coffee_ground', name: 'Coffee Ground', sku: 'COFFE-GR-400G', pack_size: '400grams', pack_price: 16000, unit: 'grams', portion_size: 1, reorder_point: 800, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Dried Ingredients' },
  { id: 'inv_coriander', name: 'Coriander', sku: 'COR-5G', pack_size: '5grams', pack_price: 1000, unit: 'grams', portion_size: 1, reorder_point: 10, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Dried Ingredients' },
  { id: 'inv_flour_dough', name: 'Flour/ Dough', sku: 'FLOUR-5KG', pack_size: '5kg', pack_price: 13500, unit: 'grams', portion_size: 1, reorder_point: 1, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Dried Ingredients' },
  { id: 'inv_ginger_garlic', name: 'Ginger & Garlic', sku: 'GING-GAR-350G', pack_size: '350grams', pack_price: 10000, unit: 'grams', portion_size: 1, reorder_point: 700, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Dried Ingredients' },
  { id: 'inv_kimbo', name: 'Kimbo', sku: 'KIM-500G', pack_size: '500grams', pack_price: 5000, unit: 'grams', portion_size: 1, reorder_point: 1000, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Dried Ingredients' },
  { id: 'inv_oregano', name: 'Oregano', sku: 'ORE-200G', pack_size: '200grams', pack_price: 9500, unit: 'grams', portion_size: 1, reorder_point: 400, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Dried Ingredients' },
  { id: 'inv_salt', name: 'Salt', sku: 'SALT-500G', pack_size: '500grams', pack_price: 500, unit: 'grams', portion_size: 1, reorder_point: 1000, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Dried Ingredients' },
  { id: 'inv_sesame_seed', name: 'Sesame Seed', sku: 'SES-100G', pack_size: '100grams', pack_price: 5000, unit: 'grams', portion_size: 1, reorder_point: 200, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Dried Ingredients' },
  { id: 'inv_sugar', name: 'Sugar', sku: 'SUG-1KG', pack_size: '1kg', pack_price: 3000, unit: 'grams', portion_size: 1, reorder_point: 2, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Dried Ingredients' },
  { id: 'inv_sugar_satchets', name: 'Sugar Satchets', sku: 'SUG-SATCH-400U', pack_size: '400units', pack_price: 19450, unit: 'units', portion_size: 1, reorder_point: 800, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Dried Ingredients' },
  { id: 'inv_yeast', name: 'Yeast', sku: 'YEAST-500G', pack_size: '500grams', pack_price: 8500, unit: 'grams', portion_size: 1, reorder_point: 1000, vendor: 'My Vendor', location: 'MISC TZ Location', group: 'Dried Ingredients' },
];

// SOFT DRINKS - Add as inventory
const SOFT_DRINKS_INVENTORY = [
  { id: 'inv_water_500ml', name: 'Water 500ml', sku: 'WATER-500ML', pack_size: '500ml', pack_price: 1500, unit: 'units', portion_size: 1, reorder_point: 10, vendor: 'My Vendor', location: 'Coca Cola/Pepsi Bottler', group: 'Soft Drinks' },
  { id: 'inv_soda_600ml', name: 'Soda 600ml', sku: 'SODA-600ML-12PK', pack_size: '12x pack, 600mL', pack_price: 2000, unit: 'units', portion_size: 1, reorder_point: 10, vendor: 'Pepsi/CocaCola', location: 'Coca Cola/Pepsi Bottler', group: 'Soft Drinks' },
  { id: 'inv_soda_1_25L', name: 'Soda 1.25L', sku: 'SODA-1.25L-12PK', pack_size: '12x pack, 1.2L', pack_price: 4000, unit: 'units', portion_size: 1, reorder_point: 10, vendor: 'Pepsi/CocaCola', location: 'Coca Cola/Pepsi Bottler', group: 'Soft Drinks' },
  { id: 'inv_soda_300ml', name: 'Soda 300ml', sku: 'SODA-300ML-12PK', pack_size: '12xpack, 300mL', pack_price: 1000, unit: 'units', portion_size: 1, reorder_point: 10, vendor: 'My Vendor', location: 'Coca Cola/Pepsi Bottler', group: 'Soft Drinks' },
];

// Add soft drinks to inventory
INVENTORY_ITEMS.push(...SOFT_DRINKS_INVENTORY);

// Modifiers
const MODIFIERS = [
  { id: 'mod_bread_white', category: 'bread', name: 'White Bread', price: 0 },
  { id: 'mod_bread_cheese_herbs', category: 'bread', name: 'Cheese & Herbs Bread', price: 0 },
  { id: 'mod_sauce_extra', category: 'sauces', name: 'Extra Sauce (above 5 sauces)', price: 700 },
  { id: 'mod_jalapenos', category: 'toppings', name: 'Jalapenos', price: 1500 },
  { id: 'mod_olives', category: 'toppings', name: 'Olives', price: 1500 },
  { id: 'mod_cheese', category: 'toppings', name: 'Extra Cheese', price: 1500 },
  { id: 'mod_avocado', category: 'toppings', name: 'Avocado', price: 1500 },
  { id: 'mod_extra_meat', category: 'proteins', name: 'Extra Meat (Chicken/Tuna)', price: 6000 },
  { id: 'mod_premium_meat', category: 'proteins', name: 'Premium Meat (Pastrami/Smoked/Tuna)', price: 6500 },
];

function seedDatabase() {
  console.log('🌱 Starting database seeding...\n');

  try {
    // Seed Categories
    console.log('📂 Seeding categories...');
    const insertCategory = db.prepare(`
      INSERT OR REPLACE INTO menu_categories 
      (id, name, description, icon, display_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    for (const category of Object.values(CATEGORIES)) {
      insertCategory.run(category.id, category.name, category.description, category.icon, category.display_order);
    }
    console.log(`✅ ${Object.keys(CATEGORIES).length} categories seeded\n`);

    // Seed Menu Items
    console.log('🍔 Seeding menu items...');
    const insertMenuItem = db.prepare(`
      INSERT OR REPLACE INTO menu_items 
      (id, category_id, name, price, currency, description, available, image_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    for (const item of MENU_ITEMS) {
      insertMenuItem.run(
        item.id,
        item.category_id,
        item.name,
        item.price,
        item.currency,
        item.description,
        1, // available
        item.image_url
      );
    }
    console.log(`✅ ${MENU_ITEMS.length} menu items seeded\n`);

    // Seed Inventory Items
    console.log('📦 Seeding inventory items...');
    const insertInventory = db.prepare(`
      INSERT OR REPLACE INTO inventory_items 
      (id, name, sku, pack_size, pack_price, unit, portion_size, quantity_on_hand, reorder_point, vendor, location, item_group, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    for (const item of INVENTORY_ITEMS) {
      insertInventory.run(
        item.id,
        item.name,
        item.sku,
        item.pack_size,
        item.pack_price,
        item.unit,
        item.portion_size,
        0, // quantity_on_hand - start at 0
        item.reorder_point,
        item.vendor,
        item.location,
        item.group
      );
    }
    console.log(`✅ ${INVENTORY_ITEMS.length} inventory items seeded\n`);

    // Seed Modifiers
    console.log('🛠️ Seeding modifiers...');
    const insertModifier = db.prepare(`
      INSERT OR REPLACE INTO modifiers 
      (id, category, name, price, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    for (const modifier of MODIFIERS) {
      insertModifier.run(modifier.id, modifier.category, modifier.name, modifier.price);
    }
    console.log(`✅ ${MODIFIERS.length} modifiers seeded\n`);

    // Seed Staff Members (Default)
    console.log('👥 Seeding staff members...');
    const insertStaff = db.prepare(`
      INSERT OR REPLACE INTO staff 
      (id, name, email, phone, role, department, status, hired_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const staffMembers = [
      { id: 'staff_admin_001', name: 'Admin User', email: 'admin@wraproll.com', phone: '+255700000000', role: 'admin', department: 'Management', status: 'active', hired_date: '2024-01-01' },
      { id: 'staff_manager_001', name: 'Manager', email: 'manager@wraproll.com', phone: '+255700000001', role: 'manager', department: 'Management', status: 'active', hired_date: '2024-01-01' },
      { id: 'staff_cashier_001', name: 'Cashier 1', email: 'cashier1@wraproll.com', phone: '+255700000002', role: 'cashier', department: 'FOH', status: 'active', hired_date: '2024-01-15' },
      { id: 'staff_cashier_002', name: 'Cashier 2', email: 'cashier2@wraproll.com', phone: '+255700000003', role: 'cashier', department: 'FOH', status: 'active', hired_date: '2024-01-15' },
      { id: 'staff_kds_001', name: 'Kitchen Staff 1', email: 'kitchen1@wraproll.com', phone: '+255700000004', role: 'kitchen', department: 'BOH', status: 'active', hired_date: '2024-01-15' },
      { id: 'staff_kds_002', name: 'Kitchen Staff 2', email: 'kitchen2@wraproll.com', phone: '+255700000005', role: 'kitchen', department: 'BOH', status: 'active', hired_date: '2024-01-15' },
      { id: 'staff_delivery_001', name: 'Delivery Driver', email: 'delivery@wraproll.com', phone: '+255700000006', role: 'delivery', department: 'Delivery', status: 'active', hired_date: '2024-02-01' },
    ];

    for (const staff of staffMembers) {
      insertStaff.run(
        staff.id,
        staff.name,
        staff.email,
        staff.phone,
        staff.role,
        staff.department,
        staff.status,
        staff.hired_date
      );
    }
    console.log(`✅ ${staffMembers.length} staff members seeded\n`);

    // Seed Settings
    console.log('⚙️ Seeding system settings...');
    const insertSetting = db.prepare(`
      INSERT OR REPLACE INTO settings 
      (key, value, type, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `);

    const settings = [
      { key: 'restaurant_name', value: 'Wrap & Roll', type: 'string' },
      { key: 'restaurant_email', value: 'info@wraproll.com', type: 'string' },
      { key: 'restaurant_phone', value: '+255700000000', type: 'string' },
      { key: 'restaurant_address', value: 'Mikocheni, Dar es Salaam, Tanzania', type: 'string' },
      { key: 'currency', value: 'TZS', type: 'string' },
      { key: 'tax_rate', value: '18', type: 'number' },
      { key: 'timezone', value: 'Africa/Dar_es_Salaam', type: 'string' },
      { key: 'language', value: 'en', type: 'string' },
      { key: 'order_prefix', value: 'ORD', type: 'string' },
      { key: 'receipt_template', value: 'default', type: 'string' },
      { key: 'enable_table_service', value: 'true', type: 'boolean' },
      { key: 'enable_delivery', value: 'true', type: 'boolean' },
      { key: 'enable_online_ordering', value: 'true', type: 'boolean' },
      { key: 'pesapal_enabled', value: 'true', type: 'boolean' },
      { key: 'cash_payments_enabled', value: 'true', type: 'boolean' },
    ];

    for (const setting of settings) {
      try {
        insertSetting.run(setting.key, setting.value, setting.type);
      } catch (error) {
        // Setting might already exist, skip
      }
    }
    console.log(`✅ ${settings.length} settings seeded\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ Database seeding completed successfully!\n');
    console.log('📊 Summary:');
    console.log(`   • Categories: ${Object.keys(CATEGORIES).length}`);
    console.log(`   • Menu Items: ${MENU_ITEMS.length}`);
    console.log(`   • Inventory Items: ${INVENTORY_ITEMS.length}`);
    console.log(`   • Modifiers: ${MODIFIERS.length}`);
    console.log(`   • Staff Members: ${staffMembers.length}`);
    console.log(`   • Settings: ${settings.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error) {
    console.error('❌ Error seeding database:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run seeding
seedDatabase();
